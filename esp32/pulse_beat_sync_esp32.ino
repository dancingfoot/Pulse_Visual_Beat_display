/*
 * Pulse Beat Sync — ESP32 Wi-Fi Client
 * =====================================
 * An ultra-precise, real-time metronome synchronized client for ESP32 microcontrollers.
 * Connects to the Pulse Link WebSockets server over Wi-Fi, calculates clock drift
 * using an SNTP-style round-trip time (RTT) offset estimation, and blinks the
 * onboard LED (GPIO 2) perfectly aligned on the beat with other peers.
 * 
 * Hardware Required:
 *   - ESP32 Development Board (NodeMCU-32S, ESP32-WROOM-32, etc.)
 *   - Onboard blue LED (pre-wired to GPIO 2 on standard boards)
 * 
 * Libraries Required (Install via Arduino IDE Library Manager):
 *   - WebSockets (by Markus Sattler)
 *   - ArduinoJson (by Benoit Blanchon)
 */

#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

// -----------------------------------------------------------------
// CONFIGURATIONS (Change these to match your setup!)
// -----------------------------------------------------------------
const char* ssid     = "YOUR_WIFI_SSID";         // Your Wi-Fi network name
const char* password = "YOUR_WIFI_PASSWORD";     // Your Wi-Fi password
const char* host     = "192.168.1.50";           // Your PC's local network IP address
const uint16_t port  = 3000;                     // Central Pulse server port (default 3000)
const char* path     = "/ws";                    // WebSocket endpoint path

#define LED_PIN 2                                // Onboard LED pin (GPIO 2 on most ESP32 boards)

// -----------------------------------------------------------------
// SESSION STATE
// -----------------------------------------------------------------
int bpm = 120;
bool isPlaying = false;
long long startTime = 0;                         // Server epoch start time (ms)
int beatsPerMeasure = 4;

// Clock Synchronizer variables
long long clockOffset = 0;                       // Offset to convert millis() to server epoch
unsigned long lastPingTime = 0;
const unsigned long pingInterval = 2500;         // Ping every 2.5 seconds
unsigned long rttHistory[10];
long long offsetHistory[10];
int rttHistoryCount = 0;

// Metronome engine variables
long long lastScheduledBeat = -1;
unsigned long ledOffTime = 0;
bool ledIsOn = false;

WebSocketsClient webSocket;

// Helper function to convert uint8_t array payloads to String
String payloadToString(uint8_t * payload, size_t length) {
  String out = "";
  for (size_t i = 0; i < length; i++) {
    out += (char)payload[i];
  }
  return out;
}

// -----------------------------------------------------------------
// WEBSOCKETS EVENT HANDLER
// -----------------------------------------------------------------
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.println("[WS] Disconnected from Pulse server!");
      isPlaying = false;
      break;
      
    case WStype_CONNECTED:
      Serial.println("[WS] Connected successfully!");
      rttHistoryCount = 0;
      clockOffset = 0;
      break;
      
    case WStype_TEXT: {
      String jsonStr = payloadToString(payload, length);
      
      // Allocate buffer for JSON parsing
      StaticJsonDocument<512> doc;
      DeserializationError error = deserializeJson(doc, jsonStr);
      
      if (error) {
        Serial.print("[JSON] Parse failed: ");
        Serial.println(error.c_str());
        return;
      }
      
      const char* msgType = doc["type"];
      if (!msgType) return;
      
      if (strcmp(msgType, "WELCOME") == 0) {
        Serial.println("[WS] Welcome received. Synchronizing timeline...");
      }
      else if (strcmp(msgType, "PONG") == 0) {
        unsigned long receiveTime = millis();
        unsigned long clientTime = doc["clientTime"];
        long long serverTime = doc["serverTime"];
        
        // Calculate Round-Trip Time (RTT) and Epoch Offset
        unsigned long rtt = receiveTime - clientTime;
        long long offset = serverTime - ((long long)clientTime + (long long)(rtt / 2));
        
        // Push to rolling history window to filter out network jitter spikes
        if (rttHistoryCount < 10) {
          rttHistory[rttHistoryCount] = rtt;
          offsetHistory[rttHistoryCount] = offset;
          rttHistoryCount++;
        } else {
          // Shift left
          for (int i = 1; i < 10; i++) {
            rttHistory[i - 1] = rttHistory[i];
            offsetHistory[i - 1] = offsetHistory[i];
          }
          rttHistory[9] = rtt;
          offsetHistory[9] = offset;
        }
        
        // Pick the offset associated with the lowest RTT for supreme accuracy
        unsigned long bestRtt = rttHistory[0];
        long long bestOffset = offsetHistory[0];
        for (int i = 1; i < rttHistoryCount; i++) {
          if (rttHistory[i] < bestRtt) {
            bestRtt = rttHistory[i];
            bestOffset = offsetHistory[i];
          }
        }
        
        clockOffset = bestOffset;
        
        Serial.print("[Sync] RTT: ");
        Serial.print(rtt);
        Serial.print(" ms | Clock Offset: ");
        Serial.print((long)(clockOffset / 1000));
        Serial.println("s");
      }
      else if (strcmp(msgType, "SYNC_STATE") == 0) {
        JsonObject stateObj = doc["state"];
        if (!stateObj.isNull()) {
          int newBpm = stateObj["bpm"];
          bool newIsPlaying = stateObj["isPlaying"];
          long long newStartTime = stateObj["startTime"];
          const char* newSig = stateObj["timeSignature"];
          
          bpm = newBpm;
          isPlaying = newIsPlaying;
          startTime = newStartTime;
          
          if (newSig) {
            // Parse beats per measure
            String sigStr = String(newSig);
            int slashIndex = sigStr.indexOf('/');
            if (slashIndex > 0) {
              beatsPerMeasure = sigStr.substring(0, slashIndex).toInt();
            }
          }
          
          Serial.print("[State] Synced -> Tempo: ");
          Serial.print(bpm);
          Serial.print(" BPM | Playing: ");
          Serial.print(isPlaying ? "YES" : "NO");
          Serial.print(" | Time Signature: ");
          Serial.println(beatsPerMeasure);
          
          // Force reschedule on playback updates
          if (!isPlaying) {
            lastScheduledBeat = -1;
            digitalWrite(LED_PIN, LOW);
            ledIsOn = false;
          }
        }
      }
      break;
    }
    default:
      break;
  }
}

// -----------------------------------------------------------------
// HARDWARE TRIGGERS
// -----------------------------------------------------------------
void triggerLedFlash(bool isAccent) {
  digitalWrite(LED_PIN, HIGH);
  
  // High-intensity duration (accent beats get a longer flash)
  ledOffTime = millis() + (isAccent ? 120 : 50);
  ledIsOn = true;
}

// -----------------------------------------------------------------
// ARDUINO SETUP
// -----------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(100);
  
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  
  // 1. Connect to Wi-Fi
  Serial.println();
  Serial.print("Connecting to Wi-Fi SSID: ");
  Serial.println(ssid);
  
  WiFi.begin(ssid, password);
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    // Blink LED during network negotiation
    digitalWrite(LED_PIN, !digitalRead(LED_PIN));
  }
  
  digitalWrite(LED_PIN, LOW);
  Serial.println("");
  Serial.print("✓ Connected! IP Address: ");
  Serial.println(WiFi.localIP());
  
  // 2. Setup WebSocket Handshake Connection
  Serial.print("Connecting to Pulse Central Server at ");
  Serial.print(host);
  Serial.print(":");
  Serial.println(port);
  
  webSocket.begin(host, port, path);
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(3000); // Try to auto-reconnect every 3s if server drops
}

// -----------------------------------------------------------------
// MAIN EXECUTION LOOP
// -----------------------------------------------------------------
void loop() {
  webSocket.loop();
  
  // A. Check and trigger non-blocking LED flash timeout
  if (ledIsOn && millis() >= ledOffTime) {
    digitalWrite(LED_PIN, LOW);
    ledIsOn = false;
  }
  
  // B. Run NTP Ping-Pong Synchronization every 2.5 seconds
  if (webSocket.isConnected() && (millis() - lastPingTime >= pingInterval)) {
    StaticJsonDocument<128> doc;
    doc["type"] = "PING";
    doc["clientTime"] = millis();
    
    String output;
    serializeJson(doc, output);
    webSocket.sendTXT(output);
    
    lastPingTime = millis();
  }
  
  // C. Metronome timing tracker
  if (isPlaying && clockOffset != 0) {
    unsigned long localMillis = millis();
    long long synchronizedNow = (long long)localMillis + clockOffset;
    long long elapsedMs = synchronizedNow - startTime;
    
    double secondsPerBeat = 60.0 / bpm;
    double beatIntervalMs = secondsPerBeat * 1000.0;
    
    long long currentBeatIndex = elapsedMs / beatIntervalMs;
    long long targetBeatTime = startTime + (currentBeatIndex * beatIntervalMs);
    
    // Check if we entered a new beat division
    if (currentBeatIndex > lastScheduledBeat) {
      // High-precision spin sleep to hit the precise millisecond target
      long long waitTime = targetBeatTime - ((long long)millis() + clockOffset);
      if (waitTime > 0 && waitTime < 50) {
        delay(waitTime);
      }
      
      int beatInMeasure = currentBeatIndex % beatsPerMeasure;
      if (beatInMeasure < 0) beatInMeasure += beatsPerMeasure;
      bool isAccent = (beatInMeasure == 0);
      
      // Flash LED!
      triggerLedFlash(isAccent);
      
      Serial.print("⚡ BEAT [ ");
      Serial.print(beatInMeasure + 1);
      Serial.println(" ]");
      
      lastScheduledBeat = currentBeatIndex;
    }
  }
}
