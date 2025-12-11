const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const crypto = require('crypto');
const packageJson = require('./package.json');

const DIST_DIR = path.join(__dirname, 'dist');
const VERSION = packageJson.version;
const PRODUCT_NAME = packageJson.build.productName || 'FluxAutoDeleter';

// Define output filename
const OUTPUT_ZIP_NAME = `${PRODUCT_NAME}_Portable_${VERSION}.zip`;
const OUTPUT_ZIP_PATH = path.join(DIST_DIR, OUTPUT_ZIP_NAME);

// Files to include in the bundle (relative to project root)
// Note: settings.ini is handled separately (from settings.dist.ini)
const EXTRA_FILES = [
    'LICENSE.txt',
    'clean-session.bat'
];

async function calculateChecksum(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', data => hash.update(data));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', err => reject(err));
    });
}

async function createBundle() {
    console.log(`\n--- Starting Bundle Creation: ${OUTPUT_ZIP_NAME} ---`);

    if (!fs.existsSync(DIST_DIR)) {
        console.error('Error: dist directory not found. Run build first.');
        process.exit(1);
    }

    // Find the Portable EXE
    const portableExeName = `${PRODUCT_NAME}_Portable_${VERSION}.exe`;
    const portableExePath = path.join(DIST_DIR, portableExeName);

    if (!fs.existsSync(portableExePath)) {
        console.error(`Error: Portable executable not found at ${portableExePath}`);
        console.error('Make sure you have run "npm run dist" and the version matches.');
        process.exit(1);
    }

    // Create a write stream for the zip file
    const output = fs.createWriteStream(OUTPUT_ZIP_PATH);
    const archive = archiver('zip', {
        zlib: { level: 9 } // Sets the compression level.
    });

    // Create a promise to wait for the archive to finish writing
    const archiveFinalized = new Promise((resolve, reject) => {
        output.on('close', resolve);
        archive.on('error', reject);
    });

    archive.pipe(output);

    // 1. Add the Portable EXE
    console.log(`Adding: ${portableExeName}`);
    archive.file(portableExePath, { name: portableExeName });

    // 2. Add settings.ini (from settings.dist.ini)
    const settingsDistPath = path.join(__dirname, 'settings.dist.ini');
    if (fs.existsSync(settingsDistPath)) {
        console.log('Adding: settings.ini (from settings.dist.ini)');
        archive.file(settingsDistPath, { name: 'settings.ini' });
    } else {
        console.warn('Warning: settings.dist.ini not found! Settings file will be missing in the bundle.');
    }

    // 3. Add Extra Files
    EXTRA_FILES.forEach(file => {
        const filePath = path.join(__dirname, file);
        if (fs.existsSync(filePath)) {
            console.log(`Adding: ${file}`);
            archive.file(filePath, { name: file });
        } else {
            console.warn(`Warning: Extra file not found: ${file}`);
        }
    });

    // 4. Add 'docs' directory
    const docsPath = path.join(__dirname, 'docs');
    if (fs.existsSync(docsPath)) {
        console.log('Adding directory: docs');
        archive.directory(docsPath, 'docs');
    } else {
        console.warn('Warning: docs directory not found');
    }

    await archive.finalize();
    await archiveFinalized; // Wait for stream to close

    console.log('\nBundle created successfully!');
    console.log(`Size: ${(fs.statSync(OUTPUT_ZIP_PATH).size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Path: ${OUTPUT_ZIP_PATH}`);
    
    // --- Checksum Generation ---
    console.log('\n--- Generating Checksums (SHA-256) ---');
    const checksums = [];
    const setupExeName = `${PRODUCT_NAME}_Setup_${VERSION}.exe`;
    const setupExePath = path.join(DIST_DIR, setupExeName);

    // 1. Checksum for Bundle Zip
    if (fs.existsSync(OUTPUT_ZIP_PATH)) {
        process.stdout.write(`Calculating for ${OUTPUT_ZIP_NAME}... `);
        const hash = await calculateChecksum(OUTPUT_ZIP_PATH);
        checksums.push(`${hash}  ${OUTPUT_ZIP_NAME}`);
        console.log('Done.');
    }

    // 2. Checksum for Setup Exe
    if (fs.existsSync(setupExePath)) {
        process.stdout.write(`Calculating for ${setupExeName}... `);
        const hash = await calculateChecksum(setupExePath);
        checksums.push(`${hash}  ${setupExeName}`);
        console.log('Done.');
    } else {
        console.warn(`Warning: Setup file not found (${setupExeName}). Checksum skipped.`);
    }

    // Write to file
    if (checksums.length > 0) {
        const checksumsPath = path.join(DIST_DIR, 'checksums.txt');
        fs.writeFileSync(checksumsPath, checksums.join('\n'));
        console.log(`Checksums saved to: ${checksumsPath}`);
        console.log('-------------------------------------------');
    }
}

createBundle().catch(err => {
    console.error('Bundle creation failed:', err);
    process.exit(1);
});
