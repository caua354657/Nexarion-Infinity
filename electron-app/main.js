const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

app.commandLine.appendSwitch('disable-http-cache');

const MARKER = 'nexarion-infinity.marker';

const HTDOCS_CANDIDATES = [
    path.join((process.env.SYSTEMDRIVE || 'C:'), 'xampp', 'htdocs'),
    'C:\\xampp\\htdocs',
    'C:\\XAMPP\\htdocs',
    'D:\\xampp\\htdocs',
    'E:\\xampp\\htdocs',
    'C:\\Program Files\\xampp\\htdocs',
    'C:\\Program Files (x86)\\xampp\\htdocs',
];

function findGameURL() {
    // Dev mode: derive folder from __dirname (electron-app/ → project root)
    if (!app.isPackaged) {
        const folder = encodeURIComponent(path.basename(path.dirname(__dirname)));
        return `http://localhost/${folder}/`;
    }

    // Packaged mode: scan known htdocs locations for the marker file
    const seen = new Set();
    for (const htdocs of HTDOCS_CANDIDATES) {
        if (seen.has(htdocs)) continue;
        seen.add(htdocs);
        if (!fs.existsSync(htdocs)) continue;
        try {
            const entries = fs.readdirSync(htdocs, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory()) continue;
                if (fs.existsSync(path.join(htdocs, entry.name, MARKER))) {
                    return `http://localhost/${encodeURIComponent(entry.name)}/`;
                }
            }
        } catch (_) {}
    }
    return null;
}

const GAME_URL = findGameURL();

let mainWindow = null;
let splashWindow = null;

function createSplash() {
    splashWindow = new BrowserWindow({
        width: 480,
        height: 300,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        resizable: false,
        center: true,
        webPreferences: { nodeIntegration: false }
    });
    splashWindow.loadFile('splash.html');
}

function createMain() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 780,
        minWidth: 900,
        minHeight: 600,
        title: 'Nexarion Infinity — Clicker Neural',
        backgroundColor: '#050510',
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        }
    });

    mainWindow.setMenuBarVisibility(false);

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.once('ready-to-show', () => {
        if (splashWindow) { splashWindow.destroy(); splashWindow = null; }
        mainWindow.show();
    });

    mainWindow.on('closed', () => { mainWindow = null; });

    mainWindow.loadURL(GAME_URL);
}

function checkServer(retries, callback) {
    const req = http.get(GAME_URL, { timeout: 3000 }, res => {
        req.destroy();
        callback(res.statusCode < 500);
    });
    req.on('error', () => {
        if (retries > 0) {
            setTimeout(() => checkServer(retries - 1, callback), 1500);
        } else {
            callback(false);
        }
    });
    req.on('timeout', () => { req.destroy(); });
}

app.whenReady().then(() => {
    createSplash();

    setTimeout(() => {
        if (!GAME_URL) {
            // Marker file not found in any htdocs — game folder not located
            if (splashWindow) {
                splashWindow.webContents.executeJavaScript(`showFolderError()`).catch(() => {});
            }
            return;
        }

        checkServer(4, (ok) => {
            if (ok) {
                createMain();
            } else {
                if (splashWindow) {
                    splashWindow.webContents.executeJavaScript(`showError()`).catch(() => {});
                }
            }
        });
    }, 800);
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (mainWindow === null && GAME_URL) createMain(); });
