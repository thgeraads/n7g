const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const unzipper = require('unzipper');
const {exec} = require('child_process');

const app = express();
const PORT = 9693;

// Middleware
app.use(cors());
app.use(express.static('public'));

// Define paths
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const WORK_DIR = path.join(__dirname, 'workdir');
const WORK_UNZIP = path.join(WORK_DIR, 'unzipped');

const IPOD_THEME_PATH = path.join(__dirname, 'ipod_theme');
const BODY_PATH = path.join(IPOD_THEME_PATH, 'body');
const HARD_REPLACE_PATH = path.join(IPOD_THEME_PATH, 'hard_replace');

// Make sure required directories exist
fs.mkdirSync(UPLOAD_DIR, {recursive: true});
fs.mkdirSync(WORK_DIR, {recursive: true});

// Multer config: store uploads in /uploads
const storage = multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({storage});

// Upload endpoint: handles uploaded ZIP
app.post('/upload', upload.single('file'), (req, res) => {
    console.log(`Received file: ${req.file.originalname}`);
    res.json({status: 'ok', filename: req.file.originalname});
});

// Build IPSW endpoint for 2012
app.get('/build-ipsw/2012', async (req, res) => {
    await handleBuildRequest('2012', path.join(IPOD_THEME_PATH, 'body_7g_unmodified'), true, res);
});

// Build IPSW endpoint for 2015
app.get('/build-ipsw/2015', async (req, res) => {
    await handleBuildRequest('2015', path.join(IPOD_THEME_PATH, 'body_7g_unmodified'), true, res);
});

// Build IPSW endpoint for 6g
app.get('/build-ipsw/6g', async (req, res) => {
    await handleBuildRequest('6g', path.join(IPOD_THEME_PATH, 'body_6g_unmodified'), false, res);
});

// Core build handler
async function handleBuildRequest(version, unmodifiedPath, useHardReplace, res) {
    try {
        const uploadedZip = path.join(UPLOAD_DIR, 'modified_assets.zip');

        let outputZip;

        if (version === '2012' || version === '2015') {
            outputZip = path.join(IPOD_THEME_PATH, `iPod_1.1.2_39A10023_${version}_repack.ipsw`);
        }
        if (version === '6g') {
            outputZip = path.join(IPOD_THEME_PATH, `iPod_1.2_36B10147_repack.ipsw`);
        }

        await buildIPSW(version, uploadedZip, unmodifiedPath, outputZip, useHardReplace);

        if (!fs.existsSync(outputZip)) {
            return res.status(500).send('IPSW build failed: output file not found');
        }

        console.log(`Sending built IPSW (${version})...`);
        res.setHeader('Content-Disposition', `attachment; filename="iPod_Nano_Custom_${version}.ipsw.zip"`);
        res.setHeader('Content-Type', 'application/zip');
        fs.createReadStream(outputZip).pipe(res);
    } catch (err) {
        console.error('Build failed:', err);
        res.status(500).send('Error during build: ' + err.message);
    }
}

// Function to handle build process
async function buildIPSW(version, uploadedZip, unmodifiedPath, outputZip, useHardReplace = true) {
    // Clean unzip dir
    fs.rmSync(WORK_UNZIP, {recursive: true, force: true});
    fs.mkdirSync(WORK_UNZIP, {recursive: true});

    console.log('Unzipping uploaded assets...');
    await fs.createReadStream(uploadedZip)
        .pipe(unzipper.Extract({path: WORK_UNZIP}))
        .promise();

    // Reset body directory
    console.log('Resetting theme body...');
    fs.rmSync(BODY_PATH, {recursive: true, force: true});
    fs.mkdirSync(BODY_PATH, {recursive: true});

    console.log(`Copying from ${unmodifiedPath}...`);
    fs.readdirSync(unmodifiedPath).forEach(file => {
        fs.copyFileSync(
            path.join(unmodifiedPath, file),
            path.join(BODY_PATH, file)
        );
    });

    console.log('Copying uploaded PNGs...');
    fs.readdirSync(WORK_UNZIP).forEach(file => {
        if (file.endsWith('.png')) {
            fs.copyFileSync(
                path.join(WORK_UNZIP, file),
                path.join(BODY_PATH, file)
            );
        }
    });

    if (useHardReplace) {
        console.log('Applying hard_replace files...');
        fs.readdirSync(HARD_REPLACE_PATH).forEach(file => {
            fs.copyFileSync(
                path.join(HARD_REPLACE_PATH, file),
                path.join(BODY_PATH, file)
            );
        });
    } else {
        console.log('Skipping hard_replace for this version.');
    }

    console.log('Running 03_art_pack.py...');
    await execPromise('python3 03_art_pack.py', {cwd: IPOD_THEME_PATH});

    if (version === '6g') {
        console.log('Running 06_firmware_pack_6g...');
        await execPromise('bash 06_firmware_pack_6g', {cwd: IPOD_THEME_PATH});
    }
    else if (version === '2012' || version === '2015') {
        console.log('Running 06_firmware_pack_7g...');
        await execPromise('bash 06_firmware_pack_7g', {cwd: IPOD_THEME_PATH});
    }
}

// Wrap child_process.exec in a promise
function execPromise(command, options = {}) {
    return new Promise((resolve, reject) => {
        exec(command, options, (error, stdout, stderr) => {
            if (error) {
                console.error(stderr);
                return reject(error);
            }
            resolve(stdout);
        });
    });
}

// Start server
app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});
