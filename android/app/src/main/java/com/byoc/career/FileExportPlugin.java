package com.byoc.career;

import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;

@CapacitorPlugin(name = "FileExport")
public class FileExportPlugin extends Plugin {
    @PluginMethod
    public void openFile(PluginCall call) {
        String value = call.getString("uri");
        String mimeType = call.getString("mimeType", "application/pdf");
        if (value == null || !value.startsWith("content://")) {
            call.reject("A saved Downloads document URI is required.");
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(Uri.parse(value), mimeType);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (android.content.ActivityNotFoundException error) {
            call.reject("No compatible app is installed to open this document.", error);
        } catch (Exception error) {
            call.reject("Unable to open the saved document.", error);
        }
    }

    @PluginMethod
    public void saveFile(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.reject("Direct Downloads export requires Android 10 or newer.");
            return;
        }

        String filename = call.getString("filename");
        String mimeType = call.getString("mimeType");
        String base64Data = call.getString("base64Data");
        if (filename == null || filename.trim().isEmpty() || mimeType == null || base64Data == null) {
            call.reject("A filename, MIME type and file payload are required.");
            return;
        }

        String safeFilename = filename.replaceAll("[^A-Za-z0-9._-]", "_");
        Uri outputUri = null;
        try {
            byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, safeFilename);
            values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/BYOC");
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);

            outputUri = getContext().getContentResolver().insert(
                MediaStore.Downloads.EXTERNAL_CONTENT_URI, values
            );
            if (outputUri == null) {
                throw new IllegalStateException("Android could not create the exported file.");
            }

            try (OutputStream stream = getContext().getContentResolver().openOutputStream(outputUri, "w")) {
                if (stream == null) throw new IllegalStateException("Android could not open the exported file.");
                stream.write(bytes);
                stream.flush();
            }

            ContentValues published = new ContentValues();
            published.put(MediaStore.MediaColumns.IS_PENDING, 0);
            int publishedRows = getContext().getContentResolver().update(outputUri, published, null, null);
            if (publishedRows != 1) {
                throw new IllegalStateException("Android could not publish the exported file to Downloads.");
            }

            JSObject result = new JSObject();
            result.put("uri", outputUri.toString());
            result.put("filename", safeFilename);
            call.resolve(result);
        } catch (Exception error) {
            if (outputUri != null) {
                try { getContext().getContentResolver().delete(outputUri, null, null); }
                catch (Exception ignored) { /* best-effort cleanup */ }
            }
            call.reject("Android file export failed: " + error.getMessage());
        }
    }
}
