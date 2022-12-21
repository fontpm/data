import { config } from "dotenv";
config();

import { DateTime } from "luxon";

const { GOOGLE_WEB_FONTS_API_KEY, OUTPUT_FILE } = process.env;

if (!GOOGLE_WEB_FONTS_API_KEY) {
    console.error("Must specify Google API key through the GOOGLE_WEB_FONTS_API_KEY environment variable.")
    process.exit(1);
}
if (!OUTPUT_FILE) {
    console.error("Must specify output file through the OUTPUT_FILE environment variable.");
    process.exit(1);
}

const apiKey = GOOGLE_WEB_FONTS_API_KEY as string;
const outputFile = OUTPUT_FILE as string;

import {webfonts as GoogleWebfonts, webfonts_v1} from '@googleapis/webfonts';
import Schema$Webfont = webfonts_v1.Schema$Webfont;
import { write } from "./util";

const webfonts = GoogleWebfonts({
    version: 'v1',
    auth: apiKey
})

type FontWeight = '' | '700';
type FontStyle = '' | 'italic';
type FontVariant = 'regular' | FontStyle | `${FontWeight}${FontStyle}`;

type FontCategory = 'serif' | 'sans-serif' | 'display';
type FontSubset = 'latin' | 'extended-latin';
type FontTag = `type:${FontCategory}` | `subset:${FontSubset}` | `variant:${FontVariant}`;
interface FontDescription {
    id: string;
    display_name: string;
    version: number;
    tags: Array<FontTag>; // Will allow for searching later on

    lastModified: number; // seconds
    variants: Array<FontVariant>;
    files: Record<FontVariant, string>;
}

function nameToId(name: string) {
    return name.toLowerCase().replace(/\s+/g, '-')
}

function dateStringToDateTime(string: string): DateTime {
    const parts = string.split('-').filter((v) => v.length > 0);
    const [year, month, day] = parts.map((v) => parseInt(v));

    return DateTime.fromObject({
        year,
        month,
        day,
        hour: 0,
        minute: 0,
        second: 0,
        millisecond: 0
    });
}

function versionToNumber(v: string) {
    const num = parseInt(v.substring(1));
    if (isNaN(num)) {
        throw new Error("Parsed version may not be NaN!");
    }
    return num;
}

function webfontToFontDescription(font: Schema$Webfont): FontDescription {
    if (!font.family) {
        throw new Error("font.family is null!");
    }
    if (!font.version) {
        throw new Error("font.version is null!");
    }
    if (!font.category) {
        throw new Error("font.category is null!")
    }
    if (!font.lastModified) {
        throw new Error("font.lastModified is null!")
    }
    if (!font.files) {
        throw new Error("font.files is null!");
    }
    if (!font.variants) {
        throw new Error("font.variants is null!");
    }

    const variants = font.variants as FontDescription["variants"];

    const subsetTags = (font.subsets ?? []).map((v) => `subset:${v as FontSubset}` as FontTag);
    const variantTags = variants.map((v) => `variant:${v as FontVariant}` as FontTag);
    const tags: FontDescription["tags"] = [
        `type:${font.category as FontCategory}`,
        ...subsetTags,
        ...variantTags // Adding an entirely different index for variants would be kind of annoying
    ];

    const files: FontDescription["files"] = {} as FontDescription["files"];
    for (const fileId in font.files) {
        const original = font.files[fileId];
        const url = new URL(original);
        files[fileId as FontVariant] = url.href.substring(url.protocol.length + 2); // saves space and stuff
    }

    return {
        id: nameToId(font.family),
        display_name: font.family,
        tags,
        files,
        lastModified: dateStringToDateTime(font.lastModified).toUnixInteger(),
        version: versionToNumber(font.version),
        variants
    };
}

interface Indices {
    families: Record<string, FontDescription>;
    tags: Record<string, Array<string>>;
}

async function collectAll(): Promise<Indices> {
    const listResult = await webfonts.webfonts.list();
    if (listResult.status !== 200) {
        throw new Error("Response was not 200 OK!");
    }

    const items = listResult.data.items;
    if (!items) {
        throw new Error("Response items is null!");
    }

    const familyIndex: Indices["families"] = {};
    const tagIndex: Indices["tags"] = {};

    for (const item of items) {
        const desc = webfontToFontDescription(item);
        familyIndex[desc.id] = desc;
        for (const tag of desc.tags) {
            tagIndex[tag] ??= [];
            tagIndex[tag].push(desc.id);
        }
    }
    return {
        families: familyIndex,
        tags: tagIndex
    };
}



async function collectAndWrite() {
    const data = await collectAll();
    await write(outputFile, data);
}

collectAndWrite().then(() => console.log("Success!")).catch((e) => console.error("Error! %O", e));