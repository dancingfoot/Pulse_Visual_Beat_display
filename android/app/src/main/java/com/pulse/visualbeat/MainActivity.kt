package com.pulse.visualbeat

import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pulse.visualbeat.audio.MetronomeEngine
import com.pulse.visualbeat.network.PulseLinkClient
import kotlinx.coroutines.launch
import kotlin.math.max
import kotlin.math.min

class MainActivity : ComponentActivity(), PulseLinkClient.PulseLinkListener {

    private lateinit var metronomeEngine: MetronomeEngine
    private lateinit var pulseLinkClient: PulseLinkClient

    // Observable states in Jetpack Compose
    private var isConnected = mutableStateOf(false)
    private var isLinkEnabled = mutableStateOf(false)
    private var peerCount = mutableIntStateOf(0)
    
    private var bpm = mutableIntStateOf(120)
    private var isPlaying = mutableStateOf(false)
    private var startTime = mutableStateOf(System.currentTimeMillis())
    private var timeSignature = mutableStateOf("4/4")
    
    private var activeBeat = mutableIntStateOf(0)
    private var beatTriggerCount = mutableIntStateOf(0) // incremented on each tick to trigger visual animations

    private var serverUrl = mutableStateOf("ws://10.0.2.2:3000") // Default to emulator host IP, can be custom set

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Initialize engines
        pulseLinkClient = PulseLinkClient(this)
        metronomeEngine = MetronomeEngine(this) { beatIndex, _ ->
            activeBeat.intValue = beatIndex
            beatTriggerCount.intValue++
        }

        setContent {
            MaterialTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = Color(0xFF0A0A0A)
                ) {
                    PulseAppScreen()
                }
            }
        }
    }

    override fun onConnectionChanged(connected: Boolean) {
        isConnected.value = connected
        if (connected) {
            Toast.makeText(this, "Connected to Pulse Link Server!", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onSyncStateReceived(bpm: Int, isPlaying: Boolean, startTime: Long, timeSignature: String) {
        this.bpm.intValue = bpm
        this.isPlaying.value = isPlaying
        this.startTime.value = startTime
        this.timeSignature.value = timeSignature

        // Push updates directly into the running Metronome Engine
        metronomeEngine.bpm = bpm
        metronomeEngine.isPlaying = isPlaying
        metronomeEngine.startTime = startTime
        metronomeEngine.timeSignature = timeSignature
    }

    override fun onPeerCountChanged(count: Int) {
        peerCount.intValue = count
    }

    override fun onDestroy() {
        super.onDestroy()
        metronomeEngine.release()
        pulseLinkClient.disconnect()
    }

    // Compose Interface Components
    @OptIn(ExperimentalMaterial3Api::class)
    @Composable
    fun PulseAppScreen() {
        var showSettings by remember { mutableStateOf(false) }
        val scope = rememberCoroutineScope()

        // Sync local clock offset from websocket NTP estimation to the metronome engine
        LaunchedEffect(pulseLinkClient.clockOffset) {
            metronomeEngine.clockOffset = pulseLinkClient.clockOffset
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xFF0A0A0A))
                .statusBarsPadding()
                .navigationBarsPadding(),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Header
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp, vertical = 16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .clip(CircleShape)
                            .background(Color(0xFFFF3B30))
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "PULSE // BEAT SYNC",
                        color = Color.White.copy(alpha = 0.5f),
                        fontSize = 11.sp,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 1.5.sp
                    )
                }

                IconButton(onClick = { showSettings = true }) {
                    Icon(
                        imageVector = Icons.Default.Settings,
                        contentDescription = "Settings",
                        tint = Color.White.copy(alpha = 0.6f)
                    )
                }
            }

            // Connection indicator panel
            if (isLinkEnabled.value) {
                Box(
                    modifier = Modifier
                        .padding(horizontal = 24.dp)
                        .clip(RoundedCornerShape(50.dp))
                        .background(Color.White.copy(alpha = 0.05f))
                        .border(1.dp, Color.White.copy(alpha = 0.1f), RoundedCornerShape(50.dp))
                        .padding(horizontal = 16.dp, vertical = 6.dp)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(6.dp)
                                .clip(CircleShape)
                                .background(if (isConnected.value) Color(0xFF00BFFF) else Color(0xFFFF3B30))
                        )
                        Text(
                            text = if (isConnected.value) "SYNCED (${peerCount.intValue} PEERS)" else "CONNECTING...",
                            color = if (isConnected.value) Color(0xFF00BFFF) else Color(0xFFFF3B30),
                            fontSize = 10.sp,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }

            // Beat Visualization Canvas Area
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                contentAlignment = Alignment.Center
            ) {
                // Background visual outer ring
                Box(
                    modifier = Modifier
                        .size(240.dp)
                        .border(1.dp, Color.White.copy(alpha = 0.05f), CircleShape)
                )

                // Layout measure dot indicators surrounding the center
                val totalBeats = try {
                    timeSignature.value.split("/")[0].toInt()
                } catch (e: Exception) {
                    4
                }

                // Beat flash visual animation math
                val isCurrentAccent = activeBeat.intValue == 0
                val flashColor = if (isCurrentAccent) Color(0xFFFF3B30) else Color.White
                
                // Spring transition pulse
                val scaleAnim = remember { Animatable(0.85f) }
                val alphaAnim = remember { Animatable(0.1f) }

                LaunchedEffect(beatTriggerCount.intValue) {
                    if (isPlaying.value) {
                        val targetScale = if (isCurrentAccent) 1.25f else 1.05f
                        scaleAnim.snapTo(0.85f)
                        alphaAnim.snapTo(1f)
                        launch {
                            scaleAnim.animateTo(
                                targetValue = targetScale,
                                animationSpec = spring(dampingRatio = 0.5f, stiffness = Spring.StiffnessMedium)
                            )
                        }
                        launch {
                            alphaAnim.animateTo(
                                targetValue = 0.1f,
                                animationSpec = tween(durationMillis = 400)
                            )
                        }
                    }
                }

                // Animated Ripple
                if (isPlaying.value && alphaAnim.value > 0.11f) {
                    Box(
                        modifier = Modifier
                            .size(180.dp)
                            .scale(scaleAnim.value * 1.5f)
                            .clip(CircleShape)
                            .background(flashColor.copy(alpha = alphaAnim.value * 0.15f))
                            .border(2.dp, flashColor.copy(alpha = alphaAnim.value * 0.4f), CircleShape)
                    )
                }

                // Core central pulse disk
                Box(
                    modifier = Modifier
                        .size(180.dp)
                        .scale(if (isPlaying.value) scaleAnim.value else 0.85f)
                        .clip(CircleShape)
                        .background(
                            if (isPlaying.value) {
                                flashColor.copy(alpha = if (isCurrentAccent) 0.95f else 0.8f)
                            } else {
                                Color.White.copy(alpha = 0.05f)
                            }
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = if (isPlaying.value) (activeBeat.intValue + 1).toString() else "",
                        color = if (isCurrentAccent) Color.Black else Color.Black,
                        fontSize = 72.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace
                    )
                }
            }

            // BPM / Metronome details
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(4.dp),
                modifier = Modifier.padding(bottom = 32.dp)
            ) {
                Row(
                    verticalAlignment = Alignment.Bottom,
                    horizontalArrangement = Arrangement.Center
                ) {
                    Text(
                        text = bpm.intValue.toString(),
                        color = Color.White,
                        fontSize = 110.sp,
                        fontWeight = FontWeight.Light,
                        fontFamily = FontFamily.Monospace,
                        letterSpacing = (-4).sp
                    )
                    Text(
                        text = "BPM",
                        color = Color.White.copy(alpha = 0.3f),
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Normal,
                        modifier = Modifier.padding(start = 12.dp, bottom = 22.dp)
                    )
                }

                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(50.dp))
                        .background(Color.White.copy(alpha = 0.05f))
                        .border(1.dp, Color.White.copy(alpha = 0.1f), RoundedCornerShape(50.dp))
                        .padding(horizontal = 14.dp, vertical = 4.dp)
                ) {
                    Text(
                        text = timeSignature.value,
                        color = Color.White.copy(alpha = 0.6f),
                        fontSize = 11.sp,
                        fontFamily = FontFamily.Monospace,
                        letterSpacing = 1.sp
                    )
                }
            }

            // Interactable Play & Adjustment Controls Area
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp, vertical = 24.dp),
                verticalArrangement = Arrangement.spacedBy(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                // Slider to adjust speed
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    Text(
                        text = "-",
                        color = Color.White.copy(alpha = 0.4f),
                        fontSize = 24.sp,
                        modifier = Modifier.clickable {
                            changeBpm(bpm.intValue - 1)
                        }
                    )

                    Slider(
                        value = bpm.intValue.toFloat(),
                        onValueChange = { changeBpm(it.toInt()) },
                        valueRange = 20f..300f,
                        colors = SliderDefaults.colors(
                            activeTrackColor = Color(0xFFFF3B30),
                            inactiveTrackColor = Color.White.copy(alpha = 0.1f),
                            thumbColor = Color(0xFFFF3B30)
                        ),
                        modifier = Modifier.weight(1f)
                    )

                    Text(
                        text = "+",
                        color = Color.White.copy(alpha = 0.4f),
                        fontSize = 20.sp,
                        modifier = Modifier.clickable {
                            changeBpm(bpm.intValue + 1)
                        }
                    )
                }

                // Tap & Play Buttons
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Tap Tempo Button
                    val tapTimes = remember { mutableStateListOf<Long>() }
                    Button(
                        onClick = {
                            val now = System.currentTimeMillis()
                            tapTimes.add(now)
                            if (tapTimes.size > 4) tapTimes.removeAt(0)
                            if (tapTimes.size >= 2) {
                                val diffs = mutableListOf<Long>()
                                for (i in 1 until tapTimes.size) {
                                    diffs.add(tapTimes[i] - tapTimes[i - 1])
                                }
                                val avgDiff = diffs.average()
                                val tappedBpm = (60000 / avgDiff).toInt()
                                if (tappedBpm in 20..300) {
                                    changeBpm(tappedBpm)
                                }
                            }
                        },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color.Transparent
                        ),
                        modifier = Modifier
                            .weight(1f)
                            .height(72.dp)
                            .border(1.dp, Color.White.copy(alpha = 0.2f), RoundedCornerShape(50.dp)),
                        shape = RoundedCornerShape(50.dp)
                    ) {
                        Text(
                            text = "TAP",
                            color = Color.White,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            fontFamily = FontFamily.Monospace,
                            letterSpacing = 2.sp
                        )
                    }

                    // Large circular play/pause button
                    Box(
                        modifier = Modifier
                            .size(72.dp)
                            .clip(CircleShape)
                            .background(if (isPlaying.value) Color.White else Color(0xFFFF3B30))
                            .clickable { togglePlay() },
                        contentAlignment = Alignment.Center
                    ) {
                        if (isPlaying.value) {
                            // Draw nice clean pause lines
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                                modifier = Modifier.size(24.dp)
                            ) {
                                Box(modifier = Modifier.fillMaxHeight().width(5.dp).background(Color.Black))
                                Box(modifier = Modifier.fillMaxHeight().width(5.dp).background(Color.Black))
                            }
                        } else {
                            Icon(
                                imageVector = Icons.Default.PlayArrow,
                                contentDescription = "Play",
                                tint = Color.White,
                                modifier = Modifier.size(36.dp)
                            )
                        }
                    }

                    // Toggle connection button
                    Button(
                        onClick = { toggleLink() },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (isLinkEnabled.value) Color(0xFF00BFFF).copy(alpha = 0.1f) else Color.Transparent
                        ),
                        modifier = Modifier
                            .weight(1f)
                            .height(72.dp)
                            .border(
                                1.dp,
                                if (isLinkEnabled.value) Color(0xFF00BFFF) else Color.White.copy(alpha = 0.2f),
                                RoundedCornerShape(50.dp)
                            ),
                        shape = RoundedCornerShape(50.dp)
                    ) {
                        Text(
                            text = "LINK",
                            color = if (isLinkEnabled.value) Color(0xFF00BFFF) else Color.White,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            fontFamily = FontFamily.Monospace,
                            letterSpacing = 2.sp
                        )
                    }
                }
            }
        }

        // Settings Sheet Modal / Dialog Overlay
        if (showSettings) {
            AlertDialog(
                onDismissRequest = { showSettings = false },
                confirmButton = {
                    TextButton(onClick = { showSettings = false }) {
                        Text("CLOSE", color = Color(0xFFFF3B30), fontWeight = FontWeight.Bold)
                    }
                },
                title = {
                    Text(
                        "METRONOME CONFIG",
                        color = Color.White,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace,
                        letterSpacing = 1.sp
                    )
                },
                text = {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        // Sound & Vibration Toggles
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("Audio Click Beep", color = Color.White.copy(alpha = 0.8f))
                            Switch(
                                checked = metronomeEngine.soundEnabled,
                                onCheckedChange = { metronomeEngine.soundEnabled = it },
                                colors = SwitchDefaults.colors(checkedThumbColor = Color(0xFFFF3B30), checkedTrackColor = Color(0xFFFF3B30).copy(alpha = 0.4f))
                            )
                        }

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("Haptic Vibration", color = Color.White.copy(alpha = 0.8f))
                            Switch(
                                checked = metronomeEngine.vibrationEnabled,
                                onCheckedChange = { metronomeEngine.vibrationEnabled = it },
                                colors = SwitchDefaults.colors(checkedThumbColor = Color(0xFFFF3B30), checkedTrackColor = Color(0xFFFF3B30).copy(alpha = 0.4f))
                            )
                        }

                        // Time Signature Customizer
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text("Time Signature", color = Color.White.copy(alpha = 0.6f), fontSize = 12.sp, fontFamily = FontFamily.Monospace)
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(Color.White.copy(alpha = 0.05f))
                                    .padding(4.dp),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                listOf("2/4", "3/4", "4/4", "5/4", "6/8").forEach { signature ->
                                    val isSelected = timeSignature.value == signature
                                    Box(
                                        modifier = Modifier
                                            .weight(1f)
                                            .clip(RoundedCornerShape(6.dp))
                                            .background(if (isSelected) Color(0xFFFF3B30) else Color.Transparent)
                                            .clickable { changeTimeSignature(signature) }
                                            .padding(vertical = 8.dp),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Text(
                                            text = signature,
                                            color = if (isSelected) Color.White else Color.White.copy(alpha = 0.6f),
                                            fontSize = 11.sp,
                                            fontWeight = FontWeight.Bold,
                                            fontFamily = FontFamily.Monospace
                                        )
                                    }
                                }
                            }
                        }

                        // Latency Compensation Slider
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text("Latency Compensation", color = Color.White.copy(alpha = 0.8f))
                                Text(
                                    "${metronomeEngine.latencyCompensation} ms",
                                    color = Color(0xFF00BFFF),
                                    fontFamily = FontFamily.Monospace
                                )
                            }
                            var sliderVal by remember { mutableFloatStateOf(metronomeEngine.latencyCompensation.toFloat()) }
                            Slider(
                                value = sliderVal,
                                onValueChange = {
                                    sliderVal = it
                                    metronomeEngine.latencyCompensation = it.toLong()
                                },
                                valueRange = -200f..200f,
                                colors = SliderDefaults.colors(
                                    activeTrackColor = Color(0xFF00BFFF),
                                    thumbColor = Color(0xFF00BFFF)
                                )
                            )
                            Text(
                                "Micro-adjust beat offsets ahead or behind (negative/positive) to lock perfectly with Bluetooth headphones, external amps, or loudspeakers.",
                                color = Color.White.copy(alpha = 0.4f),
                                fontSize = 10.sp,
                                lineHeight = 13.sp
                            )
                        }

                        // WebSockets Target Connection Input
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text("Pulse Link Server IP Address", color = Color.White.copy(alpha = 0.6f), fontSize = 12.sp, fontFamily = FontFamily.Monospace)
                            var textVal by remember { mutableStateOf(serverUrl.value) }
                            OutlinedTextField(
                                value = textVal,
                                onValueChange = {
                                    textVal = it
                                    serverUrl.value = it
                                },
                                singleLine = true,
                                textStyle = androidx.compose.ui.text.TextStyle(
                                    color = Color.White,
                                    fontFamily = FontFamily.Monospace,
                                    fontSize = 13.sp
                                ),
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedBorderColor = Color(0xFF00BFFF),
                                    unfocusedBorderColor = Color.White.copy(alpha = 0.2f),
                                    focusedContainerColor = Color.White.copy(alpha = 0.05f),
                                    unfocusedContainerColor = Color.White.copy(alpha = 0.02f)
                                ),
                                modifier = Modifier.fillMaxWidth()
                            )
                            Text(
                                "Enter host URL. Example: ws://192.168.1.50:3000/ws",
                                color = Color.White.copy(alpha = 0.4f),
                                fontSize = 10.sp
                            )
                        }
                    }
                },
                containerColor = Color(0xFF141414),
                shape = RoundedCornerShape(16.dp)
            )
        }
    }

    private fun changeBpm(newBpm: Int) {
        val clampedBpm = max(20, min(300, newBpm))
        if (isLinkEnabled.value) {
            val serverNow = System.currentTimeMillis() + pulseLinkClient.clockOffset
            val secondsPerBeat = 60.0 / bpm.intValue
            val currentBeatGlobal = (serverNow - startTime.value) / 1000.0 * (bpm.intValue / 60.0)
            val newStartTime = serverNow - (currentBeatGlobal * (60.0 / clampedBpm) * 1000.0).toLong()

            pulseLinkClient.updateState(
                bpm = clampedBpm,
                isPlaying = isPlaying.value,
                startTime = newStartTime,
                timeSignature = timeSignature.value
            )
        } else {
            // Local fallback transition
            val now = System.currentTimeMillis()
            val secondsPerBeat = 60.0 / bpm.intValue
            val currentBeatGlobal = (now - startTime.value) / 1000.0 * (bpm.intValue / 60.0)
            val newStartTime = now - (currentBeatGlobal * (60.0 / clampedBpm) * 1000.0).toLong()

            startTime.value = newStartTime
            metronomeEngine.startTime = newStartTime
            bpm.intValue = clampedBpm
            metronomeEngine.bpm = clampedBpm
        }
    }

    private fun changeTimeSignature(sig: String) {
        if (isLinkEnabled.value) {
            val serverNow = System.currentTimeMillis() + pulseLinkClient.clockOffset
            val currentBeatGlobal = (serverNow - startTime.value) / 1000.0 * (bpm.intValue / 60.0)
            val newStartTime = serverNow - (currentBeatGlobal * (60.0 / bpm.intValue) * 1000.0).toLong()

            pulseLinkClient.updateState(
                bpm = bpm.intValue,
                isPlaying = isPlaying.value,
                startTime = newStartTime,
                timeSignature = sig
            )
        } else {
            val now = System.currentTimeMillis()
            val currentBeatGlobal = (now - startTime.value) / 1000.0 * (bpm.intValue / 60.0)
            val newStartTime = now - (currentBeatGlobal * (60.0 / bpm.intValue) * 1000.0).toLong()

            startTime.value = newStartTime
            metronomeEngine.startTime = newStartTime
            timeSignature.value = sig
            metronomeEngine.timeSignature = sig
        }
    }

    private fun togglePlay() {
        val nextIsPlaying = !isPlaying.value
        if (isLinkEnabled.value) {
            val serverNow = System.currentTimeMillis() + pulseLinkClient.clockOffset
            pulseLinkClient.updateState(
                bpm = bpm.intValue,
                isPlaying = nextIsPlaying,
                startTime = if (nextIsPlaying) serverNow else startTime.value,
                timeSignature = timeSignature.value
            )
        } else {
            if (nextIsPlaying) {
                val now = System.currentTimeMillis()
                startTime.value = now
                metronomeEngine.startTime = now
            }
            isPlaying.value = nextIsPlaying
            metronomeEngine.isPlaying = nextIsPlaying
        }
    }

    private fun toggleLink() {
        if (!isLinkEnabled.value) {
            isLinkEnabled.value = true
            pulseLinkClient.connect(serverUrl.value)
        } else {
            isLinkEnabled.value = false
            isConnected.value = false
            pulseLinkClient.disconnect()
            
            // Revert back to local playing state parameters
            metronomeEngine.clockOffset = 0
            metronomeEngine.bpm = bpm.intValue
            metronomeEngine.isPlaying = isPlaying.value
            metronomeEngine.startTime = startTime.value
        }
    }
}
