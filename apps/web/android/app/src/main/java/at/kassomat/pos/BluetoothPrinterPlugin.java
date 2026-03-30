package at.kassomat.pos;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONObject;

import java.io.IOException;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@CapacitorPlugin(
    name = "BluetoothPrinter",
    permissions = {
        @Permission(
            alias = "bluetooth",
            strings = {
                Manifest.permission.BLUETOOTH,
                Manifest.permission.BLUETOOTH_ADMIN
            }
        ),
        @Permission(
            alias = "bluetoothConnect",
            strings = { "android.permission.BLUETOOTH_CONNECT" }
        ),
        @Permission(
            alias = "bluetoothScan",
            strings = { "android.permission.BLUETOOTH_SCAN" }
        ),
        @Permission(
            alias = "location",
            strings = { Manifest.permission.ACCESS_FINE_LOCATION }
        )
    }
)
public class BluetoothPrinterPlugin extends Plugin {

    private static final String TAG = "BluetoothPrinter";
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    private BluetoothAdapter bluetoothAdapter;
    private BluetoothSocket connectedSocket;
    private BluetoothDevice connectedDevice;
    private OutputStream outputStream;

    private final List<JSObject> discoveredDevices = new ArrayList<>();
    private PluginCall pendingScanCall;

    // Broadcast receiver for discovered devices during scan
    private final BroadcastReceiver discoveryReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String action = intent.getAction();
            if (BluetoothDevice.ACTION_FOUND.equals(action)) {
                BluetoothDevice device = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                if (device != null) {
                    String name = null;
                    String address = null;
                    try {
                        name = device.getName();
                        address = device.getAddress();
                    } catch (SecurityException e) {
                        Log.w(TAG, "Missing permission to read device info", e);
                    }
                    if (address != null) {
                        // Avoid duplicates
                        for (JSObject d : discoveredDevices) {
                            if (address.equals(d.getString("address"))) return;
                        }
                        JSObject obj = new JSObject();
                        obj.put("name", name != null ? name : "Unknown");
                        obj.put("address", address);
                        discoveredDevices.add(obj);
                    }
                }
            } else if (BluetoothAdapter.ACTION_DISCOVERY_FINISHED.equals(action)) {
                resolveScanCall();
            }
        }
    };

    @Override
    public void load() {
        bluetoothAdapter = BluetoothAdapter.getDefaultAdapter();
    }

    // ── scanDevices ──────────────────────────────────────────────────────────

    @PluginMethod
    public void scanDevices(PluginCall call) {
        if (bluetoothAdapter == null) {
            call.reject("Bluetooth wird auf diesem Ger\u00e4t nicht unterst\u00fctzt.");
            return;
        }

        if (!bluetoothAdapter.isEnabled()) {
            call.reject("Bluetooth ist deaktiviert. Bitte Bluetooth aktivieren.");
            return;
        }

        // Check runtime permissions for Android 12+
        if (!ensurePermissions(call, "scanPermissionCallback")) return;

        discoveredDevices.clear();

        // First, add already-paired devices (they may not show up in discovery)
        try {
            Set<BluetoothDevice> bonded = bluetoothAdapter.getBondedDevices();
            if (bonded != null) {
                for (BluetoothDevice device : bonded) {
                    JSObject obj = new JSObject();
                    obj.put("name", device.getName() != null ? device.getName() : "Unknown");
                    obj.put("address", device.getAddress());
                    discoveredDevices.add(obj);
                }
            }
        } catch (SecurityException e) {
            Log.w(TAG, "Cannot read bonded devices", e);
        }

        // Start discovery for non-paired devices
        pendingScanCall = call;

        IntentFilter filter = new IntentFilter();
        filter.addAction(BluetoothDevice.ACTION_FOUND);
        filter.addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED);
        getContext().registerReceiver(discoveryReceiver, filter);

        try {
            // Cancel any existing discovery first
            bluetoothAdapter.cancelDiscovery();
            bluetoothAdapter.startDiscovery();
        } catch (SecurityException e) {
            call.reject("Bluetooth-Berechtigung fehlt.", e.getMessage());
            pendingScanCall = null;
            return;
        }

        // Timeout: resolve after 12 seconds even if discovery hasn't finished
        getBridge().getActivity().getWindow().getDecorView().postDelayed(() -> {
            if (pendingScanCall != null) {
                try {
                    bluetoothAdapter.cancelDiscovery();
                } catch (SecurityException ignored) {}
                resolveScanCall();
            }
        }, 12_000);
    }

    @PermissionCallback
    private void scanPermissionCallback(PluginCall call) {
        if (hasRequiredPermissions()) {
            scanDevices(call);
        } else {
            call.reject("Bluetooth-Berechtigungen wurden nicht erteilt.");
        }
    }

    private void resolveScanCall() {
        if (pendingScanCall == null) return;
        try {
            getContext().unregisterReceiver(discoveryReceiver);
        } catch (IllegalArgumentException ignored) {}

        JSObject result = new JSObject();
        JSArray arr = new JSArray();
        for (JSObject d : discoveredDevices) {
            arr.put(d);
        }
        result.put("devices", arr);
        pendingScanCall.resolve(result);
        pendingScanCall = null;
    }

    // ── connect ──────────────────────────────────────────────────────────────

    @PluginMethod
    public void connect(PluginCall call) {
        String address = call.getString("address");
        if (address == null || address.isEmpty()) {
            call.reject("Adresse erforderlich.");
            return;
        }

        if (bluetoothAdapter == null) {
            call.reject("Bluetooth nicht verf\u00fcgbar.");
            return;
        }

        if (!ensurePermissions(call, "connectPermissionCallback")) return;

        // Disconnect existing connection first
        closeConnection();

        // Run connection on background thread to avoid blocking the UI
        new Thread(() -> {
            try {
                // Cancel discovery — it slows down connections
                try {
                    bluetoothAdapter.cancelDiscovery();
                } catch (SecurityException ignored) {}

                BluetoothDevice device = bluetoothAdapter.getRemoteDevice(address);
                BluetoothSocket socket = device.createRfcommSocketToServiceRecord(SPP_UUID);
                socket.connect();

                connectedSocket = socket;
                connectedDevice = device;
                outputStream = socket.getOutputStream();

                Log.i(TAG, "Connected to " + address);
                call.resolve();
            } catch (SecurityException e) {
                call.reject("Bluetooth-Berechtigung fehlt.", e.getMessage());
            } catch (IOException e) {
                Log.e(TAG, "Connection failed to " + address, e);
                call.reject("Verbindung zum Drucker fehlgeschlagen: " + e.getMessage());
                closeConnection();
            } catch (IllegalArgumentException e) {
                call.reject("Ung\u00fcltige Bluetooth-Adresse: " + address);
            }
        }).start();
    }

    @PermissionCallback
    private void connectPermissionCallback(PluginCall call) {
        if (hasRequiredPermissions()) {
            connect(call);
        } else {
            call.reject("Bluetooth-Berechtigungen wurden nicht erteilt.");
        }
    }

    // ── disconnect ───────────────────────────────────────────────────────────

    @PluginMethod
    public void disconnect(PluginCall call) {
        closeConnection();
        call.resolve();
    }

    // ── print ────────────────────────────────────────────────────────────────

    @PluginMethod
    public void print(PluginCall call) {
        if (outputStream == null || connectedSocket == null || !connectedSocket.isConnected()) {
            call.reject("Kein Drucker verbunden.");
            return;
        }

        JSArray dataArray = call.getArray("data");
        if (dataArray == null) {
            call.reject("Keine Druckdaten angegeben.");
            return;
        }

        new Thread(() -> {
            try {
                List<Integer> list = dataArray.toList();
                byte[] bytes = new byte[list.size()];
                for (int i = 0; i < list.size(); i++) {
                    bytes[i] = list.get(i).byteValue();
                }

                // Send in chunks of 1024 bytes to avoid overflowing
                // the printer's input buffer
                int chunkSize = 1024;
                for (int offset = 0; offset < bytes.length; offset += chunkSize) {
                    int length = Math.min(chunkSize, bytes.length - offset);
                    outputStream.write(bytes, offset, length);
                    outputStream.flush();
                    // Small delay between chunks to let the printer process
                    if (offset + length < bytes.length) {
                        Thread.sleep(50);
                    }
                }

                Log.i(TAG, "Printed " + bytes.length + " bytes");
                call.resolve();
            } catch (IOException e) {
                Log.e(TAG, "Print failed", e);
                call.reject("Druckfehler: " + e.getMessage());
                // Connection may be broken
                closeConnection();
            } catch (Exception e) {
                Log.e(TAG, "Print data error", e);
                call.reject("Druckdaten-Fehler: " + e.getMessage());
            }
        }).start();
    }

    // ── isConnected ──────────────────────────────────────────────────────────

    @PluginMethod
    public void isConnected(PluginCall call) {
        boolean connected = connectedSocket != null && connectedSocket.isConnected();
        JSObject result = new JSObject();
        result.put("connected", connected);
        call.resolve(result);
    }

    // ── getConnectedDevice ───────────────────────────────────────────────────

    @PluginMethod
    public void getConnectedDevice(PluginCall call) {
        JSObject result = new JSObject();
        if (connectedDevice != null && connectedSocket != null && connectedSocket.isConnected()) {
            JSObject device = new JSObject();
            try {
                device.put("name", connectedDevice.getName() != null ? connectedDevice.getName() : "Unknown");
                device.put("address", connectedDevice.getAddress());
            } catch (SecurityException e) {
                device.put("name", "Unknown");
                device.put("address", connectedDevice.getAddress());
            }
            result.put("device", device);
        } else {
            result.put("device", JSObject.NULL);
        }
        call.resolve(result);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Ensure all required Bluetooth permissions are granted.
     * On Android 12+ (API 31+), BLUETOOTH_CONNECT and BLUETOOTH_SCAN are
     * runtime permissions. On older versions, BLUETOOTH and BLUETOOTH_ADMIN
     * are normal permissions (granted at install) and we need ACCESS_FINE_LOCATION
     * for discovery.
     *
     * Returns true if all permissions are granted, false if a request was triggered.
     */
    private boolean ensurePermissions(PluginCall call, String callbackName) {
        List<String> missing = new ArrayList<>();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // Android 12+
            if (ContextCompat.checkSelfPermission(getContext(), "android.permission.BLUETOOTH_CONNECT")
                    != PackageManager.PERMISSION_GRANTED) {
                missing.add("android.permission.BLUETOOTH_CONNECT");
            }
            if (ContextCompat.checkSelfPermission(getContext(), "android.permission.BLUETOOTH_SCAN")
                    != PackageManager.PERMISSION_GRANTED) {
                missing.add("android.permission.BLUETOOTH_SCAN");
            }
        } else {
            // Android 11 and below — need location for BT discovery
            if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION)
                    != PackageManager.PERMISSION_GRANTED) {
                missing.add(Manifest.permission.ACCESS_FINE_LOCATION);
            }
        }

        if (missing.isEmpty()) {
            return true;
        }

        // Request all missing permissions at once
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            requestPermissionForAlias("bluetoothConnect", call, callbackName);
        } else {
            requestPermissionForAlias("location", call, callbackName);
        }
        return false;
    }

    public boolean hasRequiredPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return ContextCompat.checkSelfPermission(getContext(), "android.permission.BLUETOOTH_CONNECT")
                    == PackageManager.PERMISSION_GRANTED
                && ContextCompat.checkSelfPermission(getContext(), "android.permission.BLUETOOTH_SCAN")
                    == PackageManager.PERMISSION_GRANTED;
        } else {
            return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION)
                    == PackageManager.PERMISSION_GRANTED;
        }
    }

    private void closeConnection() {
        if (outputStream != null) {
            try { outputStream.close(); } catch (IOException ignored) {}
            outputStream = null;
        }
        if (connectedSocket != null) {
            try { connectedSocket.close(); } catch (IOException ignored) {}
            connectedSocket = null;
        }
        connectedDevice = null;
    }

    @Override
    protected void handleOnDestroy() {
        closeConnection();
        try {
            getContext().unregisterReceiver(discoveryReceiver);
        } catch (IllegalArgumentException ignored) {}
    }
}
