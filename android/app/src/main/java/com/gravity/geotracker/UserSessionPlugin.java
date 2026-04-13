package com.gravity.geotracker;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "UserSession")
public class UserSessionPlugin extends Plugin {

    private static final String PREFS_NAME = "GeoTrackerPrefs";
    private static final String KEY_USERNAME = "current_username";

    @PluginMethod
    public void setUsername(PluginCall call) {
        String username = call.getString("username");
        if (username == null) {
            call.reject("Must provide a username");
            return;
        }

        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString(KEY_USERNAME, username).apply();

        call.resolve();
    }

    @PluginMethod
    public void getUsername(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String username = prefs.getString(KEY_USERNAME, null);

        JSObject ret = new JSObject();
        ret.put("username", username);
        call.resolve(ret);
    }
}
