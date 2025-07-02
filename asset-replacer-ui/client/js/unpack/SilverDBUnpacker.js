/**
 * @class SilverDBUnpacker
 * A standalone JavaScript class to parse and extract images from SilverDB (.bin) archives,
 * such as those from iPod Nanos.
 *
 * This class has no external dependencies and does not interact with the DOM.
 *
 * @example
 * // In an HTML file:
 * // <input type="file" id="fileInput">
 * // <script src="SilverDBUnpacker.js"></script>
 *
 * const unpacker = new SilverDBUnpacker();
 * const input = document.getElementById('fileInput');
 *
 * input.addEventListener('change', async (event) => {
 * const file = event.target.files[0];
 * if (!file) return;
 *
 * const arrayBuffer = await file.arrayBuffer();
 *
 * try {
 * const images = await unpacker.unpack(arrayBuffer, (progress) => {
 * console.log(`Processing: ${progress.processed}/${progress.total}`);
 * });
 *
 * console.log('Extraction complete:', images);
 *
 * // Now you can display the images
 * images.forEach(img => {
 * const imageElement = new Image();
 * imageElement.src = img.dataURL;
 * document.body.appendChild(imageElement);
 * });
 *
 * } catch (error) {
 * console.error('Failed to unpack:', error);
 * }
 * });
 */
export class SilverDBUnpacker {

    /**
     * Unpacks a SilverDB archive from an ArrayBuffer.
     * @param {ArrayBuffer} arrayBuffer - The raw binary data of the .bin file.
     * @param {function(object): void} [onProgress] - An optional callback function to report progress.
     * It receives an object like { processed: number, total: number }.
     * @returns {Promise<Array<object>>} A promise that resolves to an array of image objects.
     * Each object has the shape: { id, format, width, height, imageData, dataURL }.
     */
    async unpack(arrayBuffer, onProgress) {
        const dataView = new DataView(arrayBuffer);
        let offset = 0;

        // --- 1. Main Header Parsing ---
        if (dataView.getUint32(offset, true) !== 0x03) throw new Error("Invalid magic number in header.");
        offset += 4;

        offset += 4; // Skip code_page
        offset += 4; // Skip table_type

        const tableTypeStr = String.fromCharCode.apply(null, new Uint8Array(arrayBuffer, offset, 4));
        offset += 4;
        if (tableTypeStr !== "paMB") throw new Error(`Unsupported table type: ${tableTypeStr}. Expected 'paMB'.`);

        const fileCount = dataView.getUint32(offset, true);
        offset += 4;
        offset += 8; // Skip unk0 and unk1

        // --- 2. File Reference Table ---
        const fileReferences = [];
        for (let i = 0; i < fileCount; i++) {
            const id = dataView.getUint32(offset, true);
            const fileOffset = dataView.getUint32(offset + 4, true);
            const size = dataView.getUint32(offset + 8, true);
            offset += 12;
            if (size > 0 && fileOffset > 0) { // Skip empty/invalid entries
                fileReferences.push({id, offset: fileOffset, size});
            }
        }
        const refEndOffset = offset;
        const extractedImages = [];

        // --- 3. Iterate and Extract Images ---
        for (let i = 0; i < fileReferences.length; i++) {
            const fileRef = fileReferences[i];

            if (onProgress && typeof onProgress === 'function') {
                // To avoid blocking the main thread for too long, we can yield here.
                if (i % 10 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
                onProgress({processed: i + 1, total: fileReferences.length});
            }

            try {
                const imageHeaderOffset = refEndOffset + fileRef.offset;
                let p = imageHeaderOffset;

                const imageFormat = dataView.getUint16(p, true);
                p += 2;
                p += 2; // skip file_unk0
                const rowLength = dataView.getUint16(p, true);
                p += 2;
                const flags = dataView.getUint16(p, true);
                p += 2;
                p += 8; // skip file_unk1, file_unk2
                const height = dataView.getUint32(p, true);
                p += 4;
                const width = dataView.getUint32(p, true);
                p += 4;
                const fileId = dataView.getUint32(p, true);
                p += 4;
                const dataSize = dataView.getUint32(p, true);
                p += 4;

                // if (fileRef.id !== fileId || fileRef.size !== dataSize + 32 || width === 0 || height === 0) {
                //     console.warn(`Skipping ${fileRef.id}: fileId=${fileId}, size=${fileRef.size}, expected=${dataSize + 32}, w=${width}, h=${height}`);
                //     continue;
                // }

                const pixelDataOffset = p;
                const pixels = this._parsePixelData(dataView, pixelDataOffset, {
                    imageFormat, rowLength, height, width, dataSize
                });

                if (pixels) {
                    const imageData = new ImageData(pixels, width, height);
                    const dataURL = this._createDataURL(imageData);
                    extractedImages.push({
                        id: fileId,
                        format: imageFormat,
                        width,
                        height,
                        imageData,
                        dataURL
                    });
                }
            } catch (e) {
                console.warn(`Skipping file ID ${fileRef.id} due to processing error:`, e.message);
            }
        }
        return extractedImages;
    }

    /**
     * Parses the raw pixel data based on the image format.
     * @private
     */
    _parsePixelData(dataView, offset, {imageFormat, rowLength, height, width, dataSize}) {
        let pixels = new Uint8ClampedArray(width * height * 4);
        let p = offset;

        switch (imageFormat) {
            case 0x1888: // BGRA
                for (let i = 0; i < width * height * 4; i += 4) {
                    const b = dataView.getUint8(p++);
                    const g = dataView.getUint8(p++);
                    const r = dataView.getUint8(p++);
                    const a = dataView.getUint8(p++);
                    pixels[i + 0] = r;
                    pixels[i + 1] = g;
                    pixels[i + 2] = b;
                    pixels[i + 3] = a;
                }
                break;

            case 0x0565: // RGB565
                for (let i = 0; i < width * height * 4; i += 4) {
                    const c = dataView.getUint16(p, true);
                    p += 2;
                    pixels[i + 0] = (c & 0xF800) >> 8; // R
                    pixels[i + 1] = (c & 0x07E0) >> 3; // G
                    pixels[i + 2] = (c & 0x001F) << 3; // B
                    pixels[i + 3] = 255;              // A
                }
                break;

            case 0x0008: // 8-bit Greyscale
                for (let i = 0; i < width * height * 4; i += 4) {
                    const v = dataView.getUint8(p++);
                    pixels[i + 0] = v;
                    pixels[i + 1] = v;
                    pixels[i + 2] = v;
                    pixels[i + 3] = 255;
                }
                break;

            case 0x0004: // 4-bit Greyscale
                for (let i = 0; i < (width * height * 4) / 2; i += 8) {
                    const byte = dataView.getUint8(p++);
                    const v1 = (byte >> 4) * 17;
                    const v2 = (byte & 0x0F) * 17;
                    pixels[i + 0] = v1;
                    pixels[i + 1] = v1;
                    pixels[i + 2] = v1;
                    pixels[i + 3] = 255;
                    pixels[i + 4] = v2;
                    pixels[i + 5] = v2;
                    pixels[i + 6] = v2;
                    pixels[i + 7] = 255;
                }
                break;

            case 0x0064: // 8-bit Paletted
                const paletteLength = dataView.getUint32(p, true);
                p += 4;
                const palette = [];
                for (let i = 0; i < paletteLength; i++) {
                    const b = dataView.getUint8(p++);
                    const g = dataView.getUint8(p++);
                    const r = dataView.getUint8(p++);
                    const a = dataView.getUint8(p++);
                    palette.push([r, g, b, a]);
                }
                for (let i = 0; i < width * height * 4; i += 4) {
                    const index = dataView.getUint8(p++);
                    const color = palette[index];
                    pixels[i + 0] = color[0];
                    pixels[i + 1] = color[1];
                    pixels[i + 2] = color[2];
                    pixels[i + 3] = color[3];
                }
                break;

            case 0x0065: { // 16-bit paletted
                const paletteLength = dataView.getUint32(p, true);
                p += 4;
                if (paletteLength > 65536) {
                    console.warn("Palette too large for 0x0065 format:", paletteLength);
                    return null;
                }

                const palette = [];
                for (let i = 0; i < paletteLength; i++) {
                    const b = dataView.getUint8(p++);
                    const g = dataView.getUint8(p++);
                    const r = dataView.getUint8(p++);
                    const a = dataView.getUint8(p++);
                    palette.push([r, g, b, a]);
                }

                for (let i = 0; i < width * height * 4; i += 4) {
                    const index = dataView.getUint16(p, true);
                    p += 2;
                    const color = palette[index];
                    pixels[i + 0] = color[0];
                    pixels[i + 1] = color[1];
                    pixels[i + 2] = color[2];
                    pixels[i + 3] = color[3];
                }
                break;
            }


            default:
                return null; // Unsupported format
        }

        return pixels;
    }

    /**
     * Creates a PNG Data URL from an ImageData object.
     * @private
     */
    _createDataURL(imageData) {
        const canvas = document.createElement('canvas');
        canvas.width = imageData.width;
        canvas.height = imageData.height;
        const ctx = canvas.getContext('2d');
        ctx.putImageData(imageData, 0, 0);
        return canvas.toDataURL('image/png');
    }
}
