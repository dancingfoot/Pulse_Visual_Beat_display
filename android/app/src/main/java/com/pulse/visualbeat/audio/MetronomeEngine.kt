package com.pulse.visualbeat.audio

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import kotlin.math.exp
import kotlin.math.sin

class MetronomeEngine(
    private val context: Context,
    private val onBeatTriggered: (beatIndex: Int, timeStamp: Long) -> Unit
) {
    var bpm: Int = 120
    var isPlaying: Boolean = false
        set(value) {
            field = value
            if (value) {
                startThread()
            } else {
                stopThread()
            }
        }
    var startTime: Long = System.currentTimeMillis()
    var clockOffset: Long = 0
    var latencyCompensation: Long = 0 // ms
    var timeSignature: String = "4/4"
    var soundEnabled: Boolean = true
    var vibrationEnabled: Boolean = true

    private var metronomeThread: Thread? = null
    private var isThreadRunning = false

    // Pre-synthesized click sounds
    private val sampleRate = 44100
    private lateinit var accentClick: ShortArray
    private lateinit var normalClick: ShortArray

    // AudioTrack instances for ultra-low latency playback
    private var accentTrack: AudioTrack? = null
    private var normalTrack: AudioTrack? = null

    private val vibrator: Vibrator by lazy {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vibratorManager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
            vibratorManager.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }
    }

    init {
        synthesizeClicks()
        initializeAudioTracks()
    }

    private fun synthesizeClicks() {
        accentClick = generateClick(880.0, 80) // 880Hz downbeat
        normalClick = generateClick(440.0, 80)  // 440Hz standard beat
    }

    private fun generateClick(frequency: Double, durationMs: Int): ShortArray {
        val numSamples = (sampleRate * (durationMs / 1000.0)).toInt()
        val samples = ShortArray(numSamples)
        for (i in 0 until numSamples) {
            val t = i.toDouble() / sampleRate
            var value = sin(2.0 * Math.PI * frequency * t)
            
            // Fast decay envelope
            val progress = i.toDouble() / numSamples
            val envelope = exp(-8.0 * progress)
            
            value *= envelope
            samples[i] = (value * Short.MAX_VALUE).toInt().toShort()
        }
        return samples
    }

    private fun initializeAudioTracks() {
        try {
            val bufferSizeAccent = accentClick.size * 2 // bytes
            accentTrack = AudioTrack.Builder()
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                .setAudioFormat(
                    AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setSampleRate(sampleRate)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                        .build()
                )
                .setBufferSizeInBytes(bufferSizeAccent)
                .setTransferMode(AudioTrack.MODE_STATIC)
                .build().apply {
                    write(accentClick, 0, accentClick.size)
                }

            val bufferSizeNormal = normalClick.size * 2
            normalTrack = AudioTrack.Builder()
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                .setAudioFormat(
                    AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setSampleRate(sampleRate)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                        .build()
                )
                .setBufferSizeInBytes(bufferSizeNormal)
                .setTransferMode(AudioTrack.MODE_STATIC)
                .build().apply {
                    write(normalClick, 0, normalClick.size)
                }
        } catch (e: Exception) {
            Log.error("MetronomeEngine", "Failed to initialize AudioTrack", e)
        }
    }

    private synchronized fun startThread() {
        if (isThreadRunning) return
        isThreadRunning = true
        metronomeThread = Thread(MetronomeLoop(), "MetronomeEngineThread").apply {
            priority = Thread.MAX_PRIORITY
            start()
        }
    }

    private synchronized fun stopThread() {
        isThreadRunning = false
        metronomeThread?.interrupt()
        metronomeThread = null
    }

    private fun playClick(isAccent: Boolean) {
        if (!soundEnabled) return
        try {
            val track = if (isAccent) accentTrack else normalTrack
            track?.apply {
                stop()
                reloadStaticData()
                play()
            }
        } catch (e: Exception) {
            Log.error("MetronomeEngine", "Click playback error", e)
        }
    }

    private fun triggerVibration(isAccent: Boolean) {
        if (!vibrationEnabled) return
        try {
            val duration = if (isAccent) 80L else 40L
            val amplitude = if (isAccent) VibrationEffect.DEFAULT_AMPLITUDE else 120
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createOneShot(duration, amplitude))
            } else {
                @Suppress("DEPRECATION")
                vibrator.vibrate(duration)
            }
        } catch (e: Exception) {
            // Safe fallback
        }
    }

    private inner class MetronomeLoop : Runnable {
        override fun run() {
            var lastScheduledBeat = -1L

            while (isThreadRunning) {
                try {
                    val currentBpm = bpm
                    val currentStartTime = startTime
                    val currentOffset = clockOffset
                    val currentLatency = latencyCompensation
                    
                    val secondsPerBeat = 60.0 / currentBpm
                    val beatIntervalMs = (secondsPerBeat * 1000).toLong()

                    // Absolute timeline synchronized clock
                    val systemTime = System.currentTimeMillis()
                    val synchronizedNow = systemTime + currentOffset

                    // Calculate beats indices to look ahead
                    val elapsedMsSinceStart = synchronizedNow - currentStartTime - currentLatency
                    val currentBeatIndex = Math.floor(elapsedMsSinceStart.toDouble() / beatIntervalMs.toDouble()).toLong()

                    val targetBeatTime = currentStartTime + (currentBeatIndex * beatIntervalMs) + currentLatency

                    // If we haven't scheduled this beat index yet and it is in our window
                    if (currentBeatIndex > lastScheduledBeat) {
                        val beatsPerMeasure = try {
                            timeSignature.split("/")[0].toInt()
                        } catch (e: Exception) {
                            4
                        }
                        
                        val beatInMeasure = ((currentBeatIndex % beatsPerMeasure + beatsPerMeasure) % beatsPerMeasure).toInt()
                        val isAccent = beatInMeasure == 0

                        // Calculate time to sleep until exact target click time
                        val sleepTime = targetBeatTime - (System.currentTimeMillis() + currentOffset)
                        
                        if (sleepTime > 0) {
                            Thread.sleep(sleepTime)
                        }

                        // Trigger beat!
                        playClick(isAccent)
                        triggerVibration(isAccent)
                        
                        onBeatTriggered(beatInMeasure, targetBeatTime)
                        lastScheduledBeat = currentBeatIndex
                    } else {
                        // High-resolution polling sleep (1 millisecond)
                        Thread.sleep(1)
                    }
                } catch (e: InterruptedException) {
                    break
                } catch (e: Exception) {
                    Log.error("MetronomeEngine", "Error in metronome loop", e)
                    try { Thread.sleep(10) } catch (x: InterruptedException) { break }
                }
            }
        }
    }

    fun release() {
        stopThread()
        try {
            accentTrack?.release()
            normalTrack?.release()
        } catch (e: Exception) {
            // Safe release
        }
    }
}
