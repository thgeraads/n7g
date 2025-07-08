import {extractFilteredImages} from './unpack/unpack.js';

const input = document.getElementById('ipswInput');
const status = document.getElementById('status');
const assetList = document.getElementById('assetList');

let modifiedAssets = new Map();
let originalImages = {};
let canvasRefs = {};
let showAllMode = false;

const apiBaseUrl = 'https://ipswtunnel.zeehondie.net';
// const apiBaseUrl = 'http://localhost:9693';

const toggleViewBtn = document.createElement('button');
toggleViewBtn.textContent = 'Show All Assets';
toggleViewBtn.style.marginRight = '10px';
toggleViewBtn.onclick = () => {
    showAllMode = !showAllMode;
    toggleViewBtn.textContent = showAllMode ? 'Show Only Important' : 'Show All Assets';
    if (input.files.length > 0) input.dispatchEvent(new Event('change'));
};
input.before(toggleViewBtn);

const buttonGroup = document.createElement('div');
buttonGroup.className = 'button-group';
buttonGroup.style.display = 'flex';
buttonGroup.style.gap = '10px';
buttonGroup.style.align = 'center';
buttonGroup.style.justifyContent = 'flex-start';

const copyAllBtn = document.createElement('button');
copyAllBtn.textContent = 'Copy All From Origin';
copyAllBtn.style.display = 'none';
copyAllBtn.style.height = '100%';
input.after(copyAllBtn);

const build2012Btn = document.createElement('button');
build2012Btn.textContent = 'Build IPSW (2012)';
build2012Btn.style.display = 'none';
build2012Btn.style.height = '100%';


const build2015Btn = document.createElement('button');
build2015Btn.textContent = 'Build IPSW (2015)';
build2015Btn.style.display = 'none';
build2015Btn.style.height = '100%';


const build6gBtn = document.createElement('button');
build6gBtn.textContent = 'Build IPSW (6g)';
build6gBtn.style.display = 'none';
build6gBtn.style.height = '100%';


const downloadPNGsBtn = document.createElement('button');
downloadPNGsBtn.textContent = 'Download Modified PNGs (ZIP)';
downloadPNGsBtn.style.display = 'none';
// downloadPNGsBtn.style.marginTop = '20px';
downloadPNGsBtn.style.height = '100%';


buttonGroup.appendChild(build2012Btn);
buttonGroup.appendChild(build2015Btn);
buttonGroup.appendChild(build6gBtn);
buttonGroup.appendChild(downloadPNGsBtn);

assetList.after(buttonGroup);

const spinner = document.createElement('span');
spinner.textContent = 'Processing...';
spinner.style.display = 'none';
build2015Btn.after(spinner);

// Load assets
input.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    status.textContent = 'Reading file...';
    const buffer = await file.arrayBuffer();

    try {
        const allImages = await extractFilteredImages(buffer, {});


        // Check for valid wallpaper resolution
        const sampleWallpaperId = importantAssets.wallpapers?.[0]; // Pick the first known wallpaper asset
        const expectedResolutions = {
            '6g': {width: 240, height: 240},
            '7g': {width: 240, height: 432}
        };

        const wallpaperImg = allImages.find(img => {
            const id = `${img.id}_${img.format.toString(16).padStart(4, '0')}`;
            return id === sampleWallpaperId;
        });

        if (!wallpaperImg) {
            alert(`Wallpaper asset not found in file, are you sure this is a valid ${localStorage.getItem('device') === '6g' ? '6g' : '7g'} IPSW?`);
            window.location.reload();
            return;
        }

// Determine device based on resolution
        let detectedDevice = null;
        for (const [device, res] of Object.entries(expectedResolutions)) {
            if (wallpaperImg.width === res.width && wallpaperImg.height === res.height) {
                detectedDevice = device;
                break;
            }
        }

        if (!detectedDevice) {
            status.textContent = `Unsupported wallpaper resolution: ${wallpaperImg.width}×${wallpaperImg.height}`;
            return;
        }


        const filtered = allImages.filter(img => {
            const id = `${img.id}_${img.format.toString(16).padStart(4, '0')}`;
            if (do_not_show.includes(id)) return false;
            if (showAllMode) return validAssetEndings.some(s => id.endsWith(s));
            return Object.values(importantAssets).flat().includes(id);
        });

        assetList.innerHTML = '';
        modifiedAssets.clear();
        canvasRefs = {};
        originalImages = {};
        if (localStorage.getItem('device') === "7g") {
            build2012Btn.style.display = 'inline-block';
            build2015Btn.style.display = 'inline-block';
            console.log('Detected 7g device, showing 2012 and 2015 builds.');
        } else if (localStorage.getItem('device') === "6g") {
            build6gBtn.style.display = 'inline-block';
            console.log('Detected 6g device, showing 6g build.');
        }
        copyAllBtn.style.display = 'inline-block';
        downloadPNGsBtn.style.display = 'inline-block';

        if (showAllMode) {
            const allWrapper = document.createElement('div');
            allWrapper.className = 'asset-group-content';
            for (const img of filtered) {
                const assetId = `${img.id}_${img.format.toString(16).padStart(4, '0')}`;
                allWrapper.appendChild(createAssetItem(img, assetId));
            }
            assetList.appendChild(allWrapper);
        } else {
            const groups = [
                {title: 'App Icons', keys: importantAssets.appIcons},
                {title: 'Wallpapers', keys: importantAssets.wallpapers},
                {title: 'UI Elements', keys: importantAssets.UIelements}
            ];

            for (const group of groups) {
                const groupWrapper = document.createElement('div');
                groupWrapper.className = 'asset-group';

                const groupTitle = document.createElement('div');
                groupTitle.className = 'asset-group-title';
                groupTitle.textContent = group.title;

                const groupContent = document.createElement('div');
                groupContent.className = 'asset-group-content';

                for (const img of filtered) {
                    const assetId = `${img.id}_${img.format.toString(16).padStart(4, '0')}`;
                    if(localStorage.getItem('device') === '7g') {
                        if (!group.keys.includes(assetId)) continue;
                    }
                    groupContent.appendChild(createAssetItem(img, assetId));
                }


                groupWrapper.appendChild(groupTitle);
                groupWrapper.appendChild(groupContent);
                assetList.appendChild(groupWrapper);
            }
        }

        status.textContent = `Showing ${filtered.length} assets.`;

    } catch (err) {
        console.error(err);
        status.textContent = `Error: ${err.message}`;
    }
});

// Create asset card
function createAssetItem(img, assetId) {
    const wrapper = document.createElement('div');
    wrapper.className = 'asset-item';

    const original = document.createElement('div');
    original.className = 'asset-preview';
    const originalImg = document.createElement('img');
    originalImg.src = img.dataURL;
    originalImg.width = img.width;
    originalImg.height = img.height;
    original.appendChild(originalImg);
    original.appendChild(Object.assign(document.createElement('div'), {
        className: 'info',
        textContent: `Original: ${assetId}`
    }));

    const replacement = document.createElement('div');
    replacement.className = 'asset-preview';
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#eee';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const canvasInfo = document.createElement('div');
    canvasInfo.className = 'info';
    canvasInfo.textContent = `Replacement: ${img.width}×${img.height}`;

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const bmp = await createImageBitmap(file);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
        const idata = ctx.getImageData(0, 0, canvas.width, canvas.height);

        const isIndexed = assetId.endsWith('_0064');
        const isPaletted16 = assetId.endsWith('_0065');
        let colorInfo = '';

        if (isIndexed || isPaletted16) {
            const before = countUniqueColors(idata);
            const maxColors = isIndexed ? 255 : 65535;
            const quantized = quantizeWithRgbQuant(idata, maxColors);
            ctx.putImageData(quantized, 0, 0);
            const after = countUniqueColors(quantized);
            colorInfo = `Colors: ${after} (was ${before})`;
        } else {
            colorInfo = `Colors: ${countUniqueColors(idata)}`;
        }

        canvasInfo.textContent = `Replacement: ${canvas.width}×${canvas.height} • ${colorInfo}`;
        modifiedAssets.set(assetId, canvas);
    });

    // Sync-to-Group Button
    const syncBtn = document.createElement('button');
    syncBtn.textContent = 'Sync to Group';
    syncBtn.style.marginTop = '10px';
    syncBtn.onclick = async () => {
        if (!modifiedAssets.has(assetId)) {
            alert('Upload an image first before syncing.');
            return;
        }

        const group = getGroupForAssetId(assetId);
        if (!group || !groupMap[group]) {
            alert('No valid group found for this asset.');
            return;
        }

        const srcCtx = canvas.getContext('2d');
        const imgData = srcCtx.getImageData(0, 0, canvas.width, canvas.height);

        for (const id of groupMap[group]) {
            if (id === assetId || !(id in canvasRefs)) continue;
            const {canvas: targetCanvas, ctx: targetCtx} = canvasRefs[id];
            targetCtx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);

            let resizedData = imgData;
            if (canvas.width !== targetCanvas.width || canvas.height !== targetCanvas.height) {
                const tempImg = new Image();
                tempImg.src = canvas.toDataURL();
                await tempImg.decode();
                targetCtx.imageSmoothingEnabled = false;
                targetCtx.drawImage(tempImg, 0, 0, targetCanvas.width, targetCanvas.height);
                resizedData = targetCtx.getImageData(0, 0, targetCanvas.width, targetCanvas.height);
            }

            const isIndexed = id.endsWith('_0064');
            const isPaletted16 = id.endsWith('_0065');
            if (isIndexed || isPaletted16) {
                const maxColors = isIndexed ? 255 : 65535;
                const quantized = quantizeWithRgbQuant(resizedData, maxColors);
                targetCtx.putImageData(quantized, 0, 0);
            } else {
                targetCtx.putImageData(resizedData, 0, 0);
            }

            modifiedAssets.set(id, targetCanvas);
        }

        status.textContent = `Synced ${groupMap[group].length} assets in group.`;
    };

    replacement.append(canvas, canvasInfo, fileInput, syncBtn);
    wrapper.append(original, replacement);

    canvasRefs[assetId] = {canvas, ctx};
    originalImages[assetId] = {image: originalImg};
    return wrapper;
}

copyAllBtn.addEventListener('click', async () => {
    for (const assetId in originalImages) {
        const image = new Image();
        image.src = originalImages[assetId].image.src;
        await image.decode();
        const {canvas, ctx} = canvasRefs[assetId];
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0);
        modifiedAssets.set(assetId, canvas);
    }
    status.textContent = 'All originals copied.';
});

downloadPNGsBtn.onclick = async () => {
    if (modifiedAssets.size === 0) {
        alert('No modified assets to download.');
        return;
    }

    status.textContent = 'Preparing ZIP of modified PNGs...';
    spinner.style.display = 'inline';

    const entries = {};
    for (const [assetId, canvas] of modifiedAssets.entries()) {
        const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
        const buf = await blob.arrayBuffer();
        entries[`${assetId}.png`] = new Uint8Array(buf);
    }

    const zipData = fflate.zipSync(entries, {level: 9});
    const zipBlob = new Blob([zipData], {type: 'application/zip'});

    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Modified_iPodNano_Assets.zip';
    a.click();
    URL.revokeObjectURL(url);

    spinner.style.display = 'none';
    status.textContent = 'Modified PNGs ZIP ready.';
};

function countUniqueColors(imageData) {
    const data = imageData.data;
    const colors = new Set();
    for (let i = 0; i < data.length; i += 4) {
        colors.add(`${data[i]},${data[i + 1]},${data[i + 2]},${data[i + 3]}`);
    }
    return colors.size;
}

function quantizeWithRgbQuant(imageData, maxColors) {
    const q = new RgbQuant({
        colors: maxColors,
        method: 2,
        initColors: 4096,
        minHueCols: 256,
        dithKern: null
    });

    q.sample(imageData);
    const rgbaArray = q.reduce(imageData, true);
    return new ImageData(new Uint8ClampedArray(rgbaArray), imageData.width, imageData.height);
}

async function buildIPSW(version) {
    if (modifiedAssets.size === 0) {
        alert('No assets modified.');
        return;
    }

    spinner.style.display = 'inline';
    status.textContent = `Uploading and building IPSW (${version})...`;

    const entries = {};
    for (const [assetId, canvas] of modifiedAssets.entries()) {
        const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
        const buf = await blob.arrayBuffer();
        entries[`${assetId}.png`] = new Uint8Array(buf);
    }

    const zipBlob = new Blob([fflate.zipSync(entries, {level: 9})], {type: 'application/zip'});
    const formData = new FormData();
    formData.append('file', zipBlob, 'modified_assets.zip');

    try {
        const uploadRes = await fetch(`${apiBaseUrl}/upload`, {
            method: 'POST',
            body: formData
        });

        if (!uploadRes.ok) throw new Error('Upload failed');

        let buildRes;

        if (version === '2012' || version === '2015') {
            buildRes = await fetch(`${apiBaseUrl}/build-ipsw/${version}`);
            if (!buildRes.ok) throw new Error('Build failed');
        } else if (version === '6g') {
            buildRes = await fetch(`${apiBaseUrl}/build-ipsw/6g`);
            if (!buildRes.ok) throw new Error('Build failed');
        }

        const blob = await buildRes.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `iPod_Nano_Custom_${version}.ipsw`;
        a.click();
        URL.revokeObjectURL(url);

        status.textContent = 'Download ready.';
    } catch (err) {
        console.error(err);
        status.textContent = `Build error: ${err.message}`;
    } finally {
        spinner.style.display = 'none';
    }
}

build2012Btn.onclick = () => buildIPSW('2012');
build2015Btn.onclick = () => buildIPSW('2015');
build6gBtn.onclick = () => buildIPSW('6g');
