/**
 * @class Img1Unpacker
 * A standalone JavaScript class to parse and unpack IMG1 format files.
 */
export class Img1Unpacker {
    /**
     * Unpacks an IMG1 file from an ArrayBuffer.
     * @param {ArrayBuffer} arrayBuffer - The raw binary data of the .img1 file.
     * @returns {Promise<object>} A promise that resolves to an object containing the extracted components.
     */
    async unpack(arrayBuffer) {
        const dataView = new DataView(arrayBuffer);
        const textDecoder = new TextDecoder('ascii');
        let offset = 0;

        // --- 1. Read Header ---
        console.log('Reading header...');

        const magic = textDecoder.decode(new Uint8Array(arrayBuffer, offset, 4));
        offset += 4;
        const version = textDecoder.decode(new Uint8Array(arrayBuffer, offset, 3));
        offset += 3;

        if (version !== "2.0") {
            throw new Error(`Unsupported img1 version: ${version}. Expected "2.0"`);
        }

        const signature_format = dataView.getUint8(offset); offset++;
        const entry_point = dataView.getUint32(offset, true); offset += 4;
        const body_length = dataView.getUint32(offset, true); offset += 4;
        offset += 4; // Skip data_length (inferred)
        offset += 4; // Skip footer_offset (inferred)
        const footer_length = dataView.getUint32(offset, true); offset += 4;

        const saltBytes = new Uint8Array(arrayBuffer, offset, 32); offset += 32;
        const unk0 = dataView.getUint16(offset, true); offset += 2;
        const unk1 = dataView.getUint16(offset, true); offset += 2;
        const header_signatureBytes = new Uint8Array(arrayBuffer, offset, 16); offset += 16;
        const header_leftover = dataView.getUint32(offset, true); offset += 4;

        const headerData = {
            magic,
            version,
            signature_format,
            entry_point: `0x${entry_point.toString(16).padStart(8, '0')}`,
            salt: this._toHexString(saltBytes),
            unk0,
            unk1,
            header_signature: this._toHexString(header_signatureBytes),
            header_leftover: `0x${header_leftover.toString(16).padStart(8, '0')}`
        };

        console.log('Header Data:', headerData);

        // --- 2. Extract Components ---
        console.log('Extracting file components...');

        const bodyOffset = 0x400;
        const bodyBin = arrayBuffer.slice(bodyOffset, bodyOffset + body_length);
        console.log(`Extracted body.bin: ${bodyBin.byteLength} bytes`);

        const signOffset = bodyOffset + body_length;
        const signBin = arrayBuffer.slice(signOffset, signOffset + 0x80);
        console.log(`Extracted sign.bin: ${signBin.byteLength} bytes`);

        const certOffset = signOffset + 0x80;
        const certBin = arrayBuffer.slice(certOffset, certOffset + footer_length);
        console.log(`Extracted cert.bin: ${certBin.byteLength} bytes`);

        return {
            headerData,
            bodyBin,
            signBin,
            certBin
        };
    }

    /**
     * Helper to convert an ArrayBuffer to a hex string for display.
     * @private
     */
    _toHexString(bytes) {
        return bytes.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '');
    }
}
