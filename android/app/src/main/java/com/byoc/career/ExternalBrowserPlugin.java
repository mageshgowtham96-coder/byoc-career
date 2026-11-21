package com.byoc.career;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ExternalBrowser")
public class ExternalBrowserPlugin extends Plugin {
    @PluginMethod
    public void open(PluginCall call) {
        String value = call.getString("url");
        if (value == null || value.trim().isEmpty()) {
            call.reject("A portal URL is required.");
            return;
        }
        try {
            Uri uri = Uri.parse(value);
            String scheme = uri.getScheme();
            if (uri.getHost() == null || scheme == null ||
                (!"https".equalsIgnoreCase(scheme) && !"http".equalsIgnoreCase(scheme))) {
                call.reject("Only valid HTTP(S) portal links can be opened.");
                return;
            }
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException error) {
            call.reject("No browser is available to open this portal link.", error);
        } catch (Exception error) {
            call.reject("Unable to open the external portal link.", error);
        }
    }
}
