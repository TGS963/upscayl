import fs from "fs";
import { modelsPath } from "../utils/get-resource-paths";
import { ELECTRON_COMMANDS } from "../../common/electron-commands";
import {
  savedCustomModelsPath,
  setChildProcesses,
  setStopped,
  stopped,
} from "../utils/config-variables";
import { getSingleImageArguments } from "../utils/get-arguments";
import logit from "../utils/logit";
import slash from "../utils/slash";
import { spawnUpscayl } from "../utils/spawn-upscayl";
import { parse } from "path";
import { getMainWindow } from "../main-window";
import { ImageUpscaylPayload } from "../../common/types/types";
import { ImageFormat } from "../types/types";
import showNotification from "../utils/show-notification";
import { DEFAULT_MODELS_ID_LIST } from "../../common/models-list";
import getFilenameFromPath from "../../common/get-file-name";
import decodePath from "../../common/decode-path";
import getDirectoryFromPath from "../../common/get-directory-from-path";
import readMetadata from "../utils/read-metadata";
import writeMetadata from "../utils/write-metadata";
import { exiftool } from "../utils/exiftool-instance";

const imageUpscayl = async (event, payload: ImageUpscaylPayload) => {
  const mainWindow = getMainWindow();

  if (!mainWindow) {
    logit("No main window found");
    return;
  }

  // GET VARIABLES
  const tileSize = payload.tileSize;
  const compression = payload.compression;
  const scale = payload.scale;
  const useCustomWidth = payload.useCustomWidth;
  const customWidth = useCustomWidth ? payload.customWidth : "";
  const model = payload.model as string;
  const gpuId = payload.gpuId as string;
  const saveImageAs = payload.saveImageAs as ImageFormat;
  const overwrite = payload.overwrite as boolean;
  const imagePath = decodePath(payload.imagePath);
  let inputDir = getDirectoryFromPath(imagePath);
  let outputDir = decodePath(payload.outputPath);
  const fileNameWithExt = getFilenameFromPath(imagePath);
  const fileName = parse(fileNameWithExt).name;

  // GET METADATA
  let metadata;
  try {
    metadata = await readMetadata(imagePath, exiftool);
  } catch (error) {
    logit("❌ Error reading metadata: ", error);
    mainWindow.webContents.send(
      ELECTRON_COMMANDS.UPSCAYL_ERROR,
      "Failed to read metadata.",
    );
  }

  const outFile =
    outputDir +
    slash +
    fileName +
    "_upscayl_" +
    (useCustomWidth ? `${customWidth}px_` : `${scale}x_`) +
    model +
    "." +
    saveImageAs;

  const isDefaultModel = DEFAULT_MODELS_ID_LIST.includes(model);

  // Check if windows can write the new filename to the file system
  if (outFile.length >= 255) {
    logit("Filename too long for Windows.");
    mainWindow.webContents.send(
      ELECTRON_COMMANDS.UPSCAYL_ERROR,
      "The filename exceeds the maximum path length allowed by Windows. Please shorten the filename or choose a different save location.",
    );
  }

  // UPSCALE
  if (fs.existsSync(outFile) && !overwrite) {
    // If already upscayled, just output that file
    logit("✅ Already upscayled at: ", outFile);
    mainWindow.webContents.send(ELECTRON_COMMANDS.UPSCAYL_DONE, outFile);
  } else {
    logit(
      "✅ Upscayl Variables: ",
      JSON.stringify({
        model,
        gpuId,
        saveImageAs,
        inputDir,
        fileNameWithExt,
        outputDir,
        outFile,
        fileName,
        scale,
        compression,
        customWidth,
        useCustomWidth,
        tileSize,
      }),
    );
    const upscayl = spawnUpscayl(
      getSingleImageArguments({
        inputDir: decodeURIComponent(inputDir),
        fileNameWithExt: decodeURIComponent(fileNameWithExt),
        outFile,
        modelsPath: isDefaultModel
          ? modelsPath
          : savedCustomModelsPath ?? modelsPath,
        model,
        scale,
        gpuId,
        saveImageAs,
        customWidth,
        compression,
        tileSize,
      }),
      logit,
    );

    setChildProcesses(upscayl);

    setStopped(false);
    let failed = false;

    const onData = (data: string) => {
      logit(data.toString());
      mainWindow.setProgressBar(parseFloat(data.slice(0, data.length)) / 100);
      data = data.toString();
      mainWindow.webContents.send(
        ELECTRON_COMMANDS.UPSCAYL_PROGRESS,
        data.toString(),
      );
      if (data.includes("Error")) {
        upscayl.kill();
        failed = true;
      } else if (data.includes("Resizing")) {
        mainWindow.webContents.send(ELECTRON_COMMANDS.SCALING_AND_CONVERTING);
      }
    };
    const onError = (data) => {
      if (!mainWindow) return;
      mainWindow.setProgressBar(-1);
      mainWindow.webContents.send(
        ELECTRON_COMMANDS.UPSCAYL_ERROR,
        data.toString(),
      );
      failed = true;
      upscayl.kill();
      return;
    };
    const onClose = async () => {
      if (!failed && !stopped) {
        try {
          if (metadata) await writeMetadata(outFile, metadata, exiftool);
        } catch (error) {
          logit("❌ Error writing metadata: ", error);
          mainWindow.webContents.send(
            ELECTRON_COMMANDS.UPSCAYL_ERROR,
            "Image upscaled successfully but metadata could not be preserved.",
          );
          showNotification(
            "Upscayl",
            "Image upscaled with warnings - metadata not preserved",
          );
        }
        logit("💯 Done upscaling");
        // Free up memory
        upscayl.kill();
        mainWindow.setProgressBar(-1);
        mainWindow.webContents.send(ELECTRON_COMMANDS.UPSCAYL_DONE, outFile);
        showNotification("Upscayl", "Image upscayled successfully!");
      }
    };

    upscayl.process.stderr.on("data", onData);
    upscayl.process.on("error", onError);
    upscayl.process.on("close", onClose);
  }
};

export default imageUpscayl;
