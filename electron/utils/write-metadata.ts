import { ExifTool } from "exiftool-vendored";
import logit from "../utils/logit";

const writeMetadata = async (
  outPath: string,
  metadata: Record<string, any>,
  exiftool: ExifTool,
) => {
  logit("🖊️ Writing Metadata to path: ", outPath);
  const metadataCopy = { ...metadata };
  const { FileName, SourceFile, ...rest } = metadataCopy;
  const updatedMetadata = {
    ...rest,
    ...(SourceFile && { SourceFile: outPath }),
  };
  await exiftool.write(outPath, updatedMetadata, {
    writeArgs: ["-overwrite_original"],
  });
  logit("🖊️ Metadata written successfully");
};

export default writeMetadata;
