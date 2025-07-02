/**
 * @class Fat16Parser
 * A standalone JavaScript class to parse FAT16 disk images and extract files.
 * It now supports reading Long File Names (LFN) and recursive file searching.
 */
export class Fat16Parser {
    constructor(arrayBuffer) {
        this.buffer = arrayBuffer;
        this.dataView = new DataView(arrayBuffer);
        this.textDecoder = new TextDecoder('utf-16le');
        this.dosTextDecoder = new TextDecoder('ascii');
        this._parseBootSector();
        this._readFat();
    }

    /**
     * Finds a file by recursively searching the entire disk image.
     * @param {string} filename - The name of the file to find (case-insensitive).
     * @returns {object|null} The file entry object if found, otherwise null.
     */
    findFileRecursive(filename) {
        console.log(`Starting recursive search for: ${filename}`);
        const rootEntries = this._readDirectory(0);
        return this._searchDirectory(rootEntries, filename.toUpperCase());
    }

    _searchDirectory(entries, targetFilenameUpper) {
        for (const entry of entries) {
            if (!entry.isDirectory && entry.name.toUpperCase() === targetFilenameUpper) {
                console.log(`File found: ${entry.name}`);
                return entry; // Found it!
            }
        }
        // Recurse into subdirectories after checking all files at the current level
        for (const entry of entries) {
            if (entry.isDirectory) {
                console.log(`Searching in directory: ${entry.name}`);
                const subDirEntries = this._readDirectory(entry.firstCluster);
                const found = this._searchDirectory(subDirEntries, targetFilenameUpper);
                if (found) {
                    return found; // Propagate the result up
                }
            }
        }
        return null; // Not found in this directory or its subdirectories
    }

    extractFile(fileEntry) {
        if (!fileEntry || fileEntry.isDirectory || fileEntry.size === 0) {
            return null;
        }
        const content = new Uint8Array(fileEntry.size);
        let bytesCopied = 0;
        let currentCluster = fileEntry.firstCluster;
        while (currentCluster > 0 && currentCluster < 0xFFF8 && bytesCopied < fileEntry.size) {
            const clusterOffset = this._getClusterOffset(currentCluster);
            const bytesToCopy = Math.min(this.clusterSize, fileEntry.size - bytesCopied);
            const sourceData = new Uint8Array(this.buffer, clusterOffset, bytesToCopy);
            content.set(sourceData, bytesCopied);
            bytesCopied += bytesToCopy;
            currentCluster = this._getNextCluster(currentCluster);
        }
        return content.buffer;
    }

    _parseBootSector() {
        this.bytesPerSector = this.dataView.getUint16(11, true);
        this.sectorsPerCluster = this.dataView.getUint8(13);
        this.reservedSectors = this.dataView.getUint16(14, true);
        this.numFats = this.dataView.getUint8(16);
        this.rootEntries = this.dataView.getUint16(17, true);
        this.sectorsPerFat = this.dataView.getUint16(22, true);
        this.fatStart = this.reservedSectors * this.bytesPerSector;
        this.rootDirStart = this.fatStart + (this.numFats * this.sectorsPerFat * this.bytesPerSector);
        this.rootDirSectors = Math.ceil((this.rootEntries * 32) / this.bytesPerSector);
        this.dataAreaStart = this.rootDirStart + (this.rootDirSectors * this.bytesPerSector);
        this.clusterSize = this.sectorsPerCluster * this.bytesPerSector;
    }

    _readFat() {
        this.fat = new Uint16Array(this.buffer, this.fatStart, this.sectorsPerFat * this.bytesPerSector / 2);
    }

    _getNextCluster(currentCluster) {
        if (currentCluster >= this.fat.length) return 0xFFF8;
        return (this.fat[currentCluster] >= 0xFFF8) ? 0 : this.fat[currentCluster];
    }

    _parseLfnEntry(offset) {
        const partOffsets = [1, 3, 5, 7, 9, 14, 16, 18, 20, 22, 24, 28, 30];
        let name = '';
        for (const partOffset of partOffsets) {
            const charCode = this.dataView.getUint16(offset + partOffset, true);
            if (charCode === 0x0000 || charCode === 0xFFFF) {
                return name; // End of string or padding
            }
            name += String.fromCharCode(charCode);
        }
        return name;
    }

    _readDirectory(startCluster) {
        const entries = [];
        let lfnBuffer = [];
        const processRange = (startOffset, endOffset) => {
            for (let offset = startOffset; offset < endOffset; offset += 32) {
                const firstByte = this.dataView.getUint8(offset);
                if (firstByte === 0x00) return true;
                if (firstByte === 0xE5) { lfnBuffer = []; continue; }
                const attributes = this.dataView.getUint8(offset + 11);
                if ((attributes & 0x0F) === 0x0F) {
                    lfnBuffer.unshift(this._parseLfnEntry(offset));
                } else {
                    const entry = this._parseShortEntry(offset);
                    if (entry) {
                        if (lfnBuffer.length > 0) { entry.name = lfnBuffer.join(''); lfnBuffer = []; }
                        if (entry.name !== "." && entry.name !== "..") entries.push(entry);
                    }
                }
            }
            return false;
        };

        if (startCluster === 0) {
            processRange(this.rootDirStart, this.dataAreaStart);
        } else {
            let currentCluster = startCluster;
            while (currentCluster > 0 && currentCluster < 0xFFF8) {
                const clusterOffset = this._getClusterOffset(currentCluster);
                if (processRange(clusterOffset, clusterOffset + this.clusterSize)) break;
                currentCluster = this._getNextCluster(currentCluster);
            }
        }
        return entries;
    }

    _parseShortEntry(offset) {
        const attributes = this.dataView.getUint8(offset + 11);
        if ((attributes & 0x08) !== 0) return null;
        const rawName = new Uint8Array(this.buffer, offset, 8);
        const rawExt = new Uint8Array(this.buffer, offset + 8, 3);
        const name = this.dosTextDecoder.decode(rawName).trim();
        const ext = this.dosTextDecoder.decode(rawExt).trim();
        return {
            name: ext ? `${name}.${ext}` : name,
            isDirectory: (attributes & 0x10) !== 0,
            firstCluster: this.dataView.getUint16(offset + 26, true),
            size: this.dataView.getUint32(offset + 28, true),
        };
    }

    _getClusterOffset(cluster) {
        return this.dataAreaStart + (cluster - 2) * this.clusterSize;
    }
}
