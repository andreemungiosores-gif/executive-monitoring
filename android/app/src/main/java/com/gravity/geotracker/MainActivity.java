package com.gravity.geotracker;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.location.Location;
import android.os.Bundle;
import androidx.localbroadcastmanager.content.LocalBroadcastManager;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Logger;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register Plugins here!
        registerPlugin(UserSessionPlugin.class);
        registerPlugin(BatteryOptimizationPlugin.class); // Ensure previous plugin is kept

        super.onCreate(savedInstanceState);

        // v4.0: Intercept Background Geolocation Broadcasts
        LocalBroadcastManager.getInstance(this).registerReceiver(
            new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    try {
                        Location location = intent.getParcelableExtra("location");
                        if (location != null) {
                            postLocationNative(location);
                        }
                    } catch (Exception e) {
                        Logger.error("NativeIntercept", "Error processing location broadcast", e);
                    }
                }
            },
            new IntentFilter("com.equimaps.capacitor_background_geolocation.broadcast")
        );
    }

    private void postLocationNative(Location loc) {
        new Thread(() -> {
            try {
                // v5.0 SCALABILITY: Read Username from SharedPreferences
                SharedPreferences prefs = getApplicationContext().getSharedPreferences("GeoTrackerPrefs", Context.MODE_PRIVATE);
                String username = prefs.getString("current_username", null);

                // FALLBACK MECHANISM (Crucial for reliability)
                if (username == null || username.isEmpty()) {
                    Logger.warn("NativeIntercept", "Username null. Using fallback to keep tracking alive.");
                    username = "executive_fallback"; 
                }

                long timestamp = System.currentTimeMillis();
                
                // Construct JSON Payload
                String jsonBody = String.format(
                    java.util.Locale.US,
                    "{\"latitude\":%f,\"longitude\":%f,\"heading\":%f,\"speed\":%f,\"timestamp\":%d,\"status\":\"active_native\",\"user\":\"%s\"}",
                    loc.getLatitude(),
                    loc.getLongitude(),
                    loc.getBearing(),
                    loc.getSpeed(),
                    timestamp,
                    username
                );

                // 1. LIVE UPDATE (PUT) - "Where am I right now?"
                String LIVE_URL = "https://ubicacionandree-default-rtdb.firebaseio.com/locations/" + username + ".json";
                sendNativeRequest("PUT", LIVE_URL, jsonBody);

                // 2. HISTORY LOG (POST) - "Where have I been?"
                // Format Date: yyyy-MM-dd
                String dateStr = new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(new java.util.Date(timestamp));
                String HISTORY_URL = "https://ubicacionandree-default-rtdb.firebaseio.com/routes/" + dateStr + "/" + username + ".json";
                sendNativeRequest("POST", HISTORY_URL, jsonBody);

            } catch (Exception e) {
                Logger.error("NativeIntercept", "Network Fail", e);
            }
        }).start();
    }

    // Helper for clean HTTP requests
    private void sendNativeRequest(String method, String urlString, String jsonBody) throws Exception {
        URL url = new URL(urlString);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod(method);
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setConnectTimeout(10000);
        conn.setReadTimeout(10000);
        conn.setDoOutput(true);

        try (OutputStream os = conn.getOutputStream()) {
            byte[] input = jsonBody.getBytes("utf-8");
            os.write(input, 0, input.length);
        }

        int code = conn.getResponseCode();
        Logger.info("NativeIntercept", method + " to " + urlString + " -> " + code);
        conn.disconnect();
    }
}
