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
const OUTPUT_ZIP = path.join(IPOD_THEME_PATH, 'iPod_1.1.2_39A10023_2012_repack.ipsw');

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

// Endpoint to build the IPSW from uploaded assets
app.get('/build-ipsw', async (req, res) => {
    try {
        const version = req.query.version === '2015' ? '2015' : '2012'; // fallback to 2012

        const uploadedZip = path.join(UPLOAD_DIR, 'modified_assets.zip');
        const BODY_UNMODIFIED_PATH = path.join(IPOD_THEME_PATH, 'body_unmodified');
        const HARD_REPLACE_PATH = path.join(IPOD_THEME_PATH, 'hard_replace');
        const OUTPUT_ZIP = path.join(IPOD_THEME_PATH, `iPod_1.1.2_39A10023_${version}_repack.ipsw`);

        // Clean unzip dir
        fs.rmSync(WORK_UNZIP, { recursive: true, force: true });
        fs.mkdirSync(WORK_UNZIP, { recursive: true });

        console.log('Unzipping uploaded assets...');
        await fs.createReadStream(uploadedZip)
            .pipe(unzipper.Extract({ path: WORK_UNZIP }))
            .promise();

        // Reset body directory
        console.log('Resetting theme body...');
        fs.rmSync(BODY_PATH, { recursive: true, force: true });
        fs.mkdirSync(BODY_PATH, { recursive: true });

        console.log('Copying body_unmodified...');
        fs.readdirSync(BODY_UNMODIFIED_PATH).forEach(file => {
            fs.copyFileSync(
                path.join(BODY_UNMODIFIED_PATH, file),
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

        console.log('Applying hard_replace files...');
        fs.readdirSync(HARD_REPLACE_PATH).forEach(file => {
            fs.copyFileSync(
                path.join(HARD_REPLACE_PATH, file),
                path.join(BODY_PATH, file)
            );
        });

        // Build scripts
        console.log('Running 03_art_pack.py...');
        await execPromise('python3 03_art_pack.py', { cwd: IPOD_THEME_PATH });

        console.log('Running 06_firmware_pack_7g...');
        await execPromise('bash 06_firmware_pack_7g', { cwd: IPOD_THEME_PATH });

        // Validate build
        if (!fs.existsSync(OUTPUT_ZIP)) {
            return res.status(500).send('IPSW build failed: output file not found');
        }

        // Send ZIP
        console.log(`Sending built IPSW (${version})...`);
        res.setHeader('Content-Disposition', `attachment; filename="iPod_Nano_Custom_${version}.ipsw.zip"`);
        res.setHeader('Content-Type', 'application/zip');
        fs.createReadStream(OUTPUT_ZIP).pipe(res);

    } catch (err) {
        console.error('Build failed:', err);
        res.status(500).send('Error during build: ' + err.message);
    }
});


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
