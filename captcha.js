const sharp = require('sharp');
const Tesseract = require('tesseract.js');
const fs = require('fs');

/**
 * Performs OCR on the given image file and returns the extracted text.
 * @param {string} imagePath - The path to the image file.
 * @returns {Promise<string>} - The extracted text.
 */
async function performOcr(imagePath) {
    console.log('Performing OCR on CAPTCHA image...');
    try {
        const { data: { text } } = await Tesseract.recognize(imagePath, 'eng');
        return text.trim();
    } catch (error) {
        console.error('Error during OCR:', error);
        throw new Error('OCR failed');
    }
}

/**
 * Captures a screenshot of a CAPTCHA image.
 * @param {object} frame - The Puppeteer frame to capture the screenshot from.
 * @param {string} selector - The selector for the CAPTCHA image.
 * @param {string} path - The path to save the CAPTCHA image.
 * @returns {Promise<void>}
 */
async function captureCaptchaImage(frame, selector, path) {
    console.log('Capturing CAPTCHA image...');
    try {
        await frame.waitForSelector(selector);
        const captchaImage = await frame.$(selector);
        await captchaImage.screenshot({ path });
    } catch (error) {
        console.error('Error capturing CAPTCHA image:', error);
        throw new Error('Failed to capture CAPTCHA image');
    }
}

/**
 * Preprocesses the CAPTCHA image for better OCR results.
 * @param {string} inputPath - The path to the input image file.
 * @param {string} outputPath - The path to save the preprocessed image.
 * @returns {Promise<void>}
 */
async function preprocessCaptchaImage(inputPath, outputPath) {
    console.log('Preprocessing CAPTCHA image...');
    try {
        await sharp(inputPath)
            .resize(300) // Adjust the size based on your needs
            .grayscale()
            .normalize()
            .toFile(outputPath);
        console.log('CAPTCHA image preprocessed successfully');
    } catch (error) {
        console.error('Error during image preprocessing:', error);
        throw new Error('Image preprocessing failed');
    }
}

module.exports = {
    performOcr,
    captureCaptchaImage,
    preprocessCaptchaImage
};
