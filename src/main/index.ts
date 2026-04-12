import { app, shell, BrowserWindow, ipcMain, session } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import icon from '../../resources/icon.png?asset';
import { registerIPCHandlers, onAudioChunk } from './ipc';
import { AudioPipeline } from './audio';

let mainWindow: BrowserWindow | null = null;

function sendToRenderer(event: string, data: unknown): void {
  mainWindow?.webContents.send('pipeline:event', event, data);
}

function createWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron');

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // Grant microphone permission
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media');
  });

  // Register IPC handlers
  registerIPCHandlers();

  // Initialize audio pipeline: Resample → VAD → Speech chunks
  const pipeline = new AudioPipeline();
  pipeline
    .init()
    .then(() => {
      pipeline.onSpeechStart(() => {
        console.log('[pipeline] Speech started');
        sendToRenderer('vad:status', { speaking: true });
      });
      pipeline.onSpeechEnd((audio) => {
        const durationMs = (audio.length / 16000) * 1000;
        console.log(
          `[pipeline] Speech ended: ${audio.length} samples (${durationMs.toFixed(0)}ms)`
        );
        sendToRenderer('vad:status', { speaking: false });
        sendToRenderer('speech:segment', { samples: audio.length, durationMs });
        // TODO (Task 2.3): Send speech chunk to STT
      });

      onAudioChunk((samples) => {
        // Compute RMS level for the debug UI
        let sum = 0;
        for (let i = 0; i < samples.length; i++) {
          sum += samples[i] * samples[i];
        }
        const rms = Math.sqrt(sum / samples.length);
        sendToRenderer('audio:level', { rms, sampleCount: samples.length });

        pipeline.feed(samples).catch((err) => {
          console.error('[pipeline] Error processing audio:', err);
        });
      });
    })
    .catch((err) => {
      console.error('[pipeline] Failed to initialize:', err);
      // Fallback: just log audio chunks
      onAudioChunk((samples) => {
        const peak = Math.max(...samples.slice(0, 100)).toFixed(4);
        console.log(`[audio] chunk: ${samples.length} samples, peak=${peak}`);
      });
    });

  // IPC test
  ipcMain.on('ping', () => console.log('pong'));

  createWindow();

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
