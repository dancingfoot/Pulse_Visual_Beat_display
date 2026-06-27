package com.pulse.visualbeat.network

import android.os.Handler
import android.os.Looper
import android.util.Log
import com.google.gson.Gson
import com.google.gson.JsonObject
import okhttp3.*
import java.util.concurrent.TimeUnit

class PulseLinkClient(private val listener: PulseLinkListener) {

    interface PulseLinkListener {
        fun onConnectionChanged(connected: Boolean)
        fun onSyncStateReceived(bpm: Int, isPlaying: Boolean, startTime: Long, timeSignature: String)
        fun onPeerCountChanged(count: Int)
    }

    private val client = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build()

    private var webSocket: WebSocket? = null
    private var clientId: String? = null
    private var isConnected = false
    private var serverUrl: String = ""

    // Clock sync variables
    var clockOffset: Long = 0
        private set

    private val rttHistory = mutableListOf<RttSample>()
    private val mainHandler = Handler(Looper.getMainLooper())
    private val gson = Gson()

    private data class RttSample(val rtt: Long, val offset: Long)

    private val pingRunnable = object : Runnable {
        override fun run() {
            if (isConnected) {
                sendPing()
                mainHandler.postDelayed(this, 2500)
            }
        }
    }

    fun connect(url: String) {
        if (webSocket != null) return
        serverUrl = url
        val request = Request.Builder().url(url).build()
        webSocket = client.newWebSocket(request, createWebSocketListener())
    }

    fun disconnect() {
        mainHandler.removeCallbacks(pingRunnable)
        webSocket?.close(1000, "App disconnected")
        webSocket = null
        isConnected = false
        listener.onConnectionChanged(false)
    }

    private fun sendPing() {
        val pingJson = JsonObject().apply {
            addProperty("type", "PING")
            addProperty("clientTime", System.currentTimeMillis())
        }
        webSocket?.send(gson.toJson(pingJson))
    }

    fun updateState(bpm: Int, isPlaying: Boolean, startTime: Long, timeSignature: String = "4/4") {
        if (!isConnected) return
        val stateObj = JsonObject().apply {
            addProperty("bpm", bpm)
            addProperty("isPlaying", isPlaying)
            addProperty("startTime", startTime)
            addProperty("timeSignature", timeSignature)
        }
        val updateJson = JsonObject().apply {
            addProperty("type", "UPDATE_STATE")
            add("state", stateObj)
        }
        webSocket?.send(gson.toJson(updateJson))
    }

    private fun createWebSocketListener(): WebSocketListener {
        return object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                isConnected = true
                rttHistory.clear()
                mainHandler.post {
                    listener.onConnectionChanged(true)
                    // Start SNTP Sync pinging
                    mainHandler.post(pingRunnable)
                }
                Log.d("PulseLinkClient", "Connected to synchronizer: $serverUrl")
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                try {
                    val jsonObj = gson.fromJson(text, JsonObject::class.java)
                    val type = jsonObj.get("type")?.asString ?: return

                    when (type) {
                        "WELCOME" -> {
                            clientId = jsonObj.get("clientId")?.asString
                        }
                        "PONG" -> {
                            val receiveTime = System.currentTimeMillis()
                            val clientTime = jsonObj.get("clientTime")?.asLong ?: 0L
                            val serverTime = jsonObj.get("serverTime")?.asLong ?: 0L

                            val rtt = receiveTime - clientTime
                            // Offset = Server Time - Client Estimate
                            val offset = serverTime - (clientTime + rtt / 2)

                            synchronized(rttHistory) {
                                rttHistory.add(RttSample(rtt, offset))
                                if (rttHistory.size > 10) {
                                    rttHistory.removeAt(0)
                                }
                                // Pick sample with lowest RTT
                                val bestSample = rttHistory.minByOrNull { it.rtt }
                                if (bestSample != null) {
                                    clockOffset = bestSample.offset
                                }
                            }
                        }
                        "SYNC_STATE" -> {
                            val state = jsonObj.getAsJsonObject("state") ?: return
                            val lastUpdatedBy = state.get("lastUpdatedBy")?.asString

                            // Only sync if the update came from another peer
                            if (lastUpdatedBy != clientId) {
                                val bpm = state.get("bpm")?.asInt ?: 120
                                val isPlaying = state.get("isPlaying")?.asBoolean ?: false
                                val startTime = state.get("startTime")?.asLong ?: System.currentTimeMillis()
                                val timeSignature = state.get("timeSignature")?.asString ?: "4/4"

                                mainHandler.post {
                                    listener.onSyncStateReceived(bpm, isPlaying, startTime, timeSignature)
                                }
                            }
                        }
                        "PEER_COUNT" -> {
                            val count = jsonObj.get("count")?.asInt ?: 0
                            mainHandler.post {
                                listener.onPeerCountChanged(count)
                            }
                        }
                    }
                } catch (e: Exception) {
                    Log.e("PulseLinkClient", "Error parsing message: $text", e)
                }
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(1000, null)
                handleDisconnect()
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.e("PulseLinkClient", "WebSocket failure", t)
                handleDisconnect()
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                handleDisconnect()
            }
        }
    }

    private fun handleDisconnect() {
        if (!isConnected) return
        isConnected = false
        clientId = null
        clockOffset = 0
        mainHandler.removeCallbacks(pingRunnable)
        mainHandler.post {
            listener.onConnectionChanged(false)
            listener.onPeerCountChanged(0)
            // Attempt auto-reconnection after 3 seconds
            mainHandler.postDelayed({
                if (!isConnected && webSocket != null) {
                    Log.d("PulseLinkClient", "Attempting automatic reconnection...")
                    webSocket = null
                    connect(serverUrl)
                }
            }, 3000)
        }
    }
}
