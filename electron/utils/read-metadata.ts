import { ExifTool } from "exiftool-vendored";
import logit from "../utils/logit";

const readMetadata = async (path: string, exiftool: ExifTool) => {
  logit("🔍 Reading Metadata: ", path);
  return await exiftool.read(path, { readArgs: ["-b"] });
};

export default readMetadata;
