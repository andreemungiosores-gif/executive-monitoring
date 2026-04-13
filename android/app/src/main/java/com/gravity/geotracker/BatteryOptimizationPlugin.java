package com.gravity.geotracker;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.PowerManager;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.net.HttpURLConnection;
import java.net.URL;
import java.io.OutputStream;

@CapacitorPlugin(name = "BatteryOptimization")
public class BatteryOptimizationPlugin extends Plugin {

    private PowerManager.WakeLock wakeLock;

    @PluginMethod
    public void requestIgnoreBatteryOptimizations(PluginCall call) {
        Context context = getContext();
        String packageName = context.getPackageName();
        PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);

        if (pm.isIgnoringBatteryOptimizations(packageName)) {
            JSObject ret = new JSObject();
            ret.put("isIgnoring", true);
            call.resolve(ret);
        } else {
            try {
                Intent intent = new Intent();
                intent.setAction(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                intent.setData(Uri.parse("package:" + packageName));
                context.startActivity(intent);

                JSObject ret = new JSObject();
                ret.put("isIgnoring", false);
                call.resolve(ret);
            } catch (Exception e) {
                // Fallback
                try {
                    Intent intent = new Intent();
                    intent.setAction(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                    context.startActivity(intent);

                    JSObject ret = new JSObject();
                    ret.put("isIgnoring", false);
                    ret.put("fallback", true);
                    call.resolve(ret);
                } catch (Exception e2) {
                    call.reject("Failed to open settings: " + e2.getMessage());
                }
            }
        }
    }

    @PluginMethod
    public void openBatterySettings(PluginCall call) {
        Context context = getContext();
        try {
            Intent intent = new Intent();
            intent.setAction(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
            context.startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void acquireWakeLock(PluginCall call) {
        try {
            if (wakeLock == null) {
                PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
                if (pm != null) {
                    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "GeoTracker:KeepAlive");
                    wakeLock.setReferenceCounted(false);
                }
            }
            if (wakeLock != null && !wakeLock.isHeld()) {
                wakeLock.acquire();
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("WakeLock Error: " + e.getMessage());
        }
    }

    @PluginMethod
    public void releaseWakeLock(PluginCall call) {
        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void postLocation(PluginCall call) {
        String urlString = call.getString("url");
        String body = call.getString("body");
        
        new Thread(() -> {
            try {
                URL url = new URL(urlString);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("PUT"); 
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setConnectTimeout(10000); // 10s
                conn.setReadTimeout(10000);    // 10s
                conn.setDoOutput(true);
                
                try(OutputStream os = conn.getOutputStream()) {
                    byte[] input = body.getBytes("utf-8");
                    os.write(input, 0, input.length);
                }
                
                int code = conn.getResponseCode();
                JSObject ret = new JSObject();
                ret.put("status", code);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Native HTTP Error: " + e.getMessage());
            }
        }).start();
    }
}
