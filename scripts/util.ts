import * as path from "path";
import {existsSync, mkdirSync} from "fs";
import { writeFile } from "fs/promises";

export async function write(targetPath: string, data: any) {
    const resolvedTargetPath = path.resolve(targetPath);
    const parent = path.dirname(resolvedTargetPath);
    if (!existsSync(parent)) {
        mkdirSync(parent, { recursive: true });
    }
    await writeFile(resolvedTargetPath, JSON.stringify(data));
}