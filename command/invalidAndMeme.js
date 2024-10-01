import pkg from '@whiskeysockets/baileys'; // Import the default export
const { MessageMedia } = pkg; // Destructure MessageMedia from the imported package

export async function handleInvalidCommand(message) {
    await message.reply('Bro, I only know counting till 5. Please press any number from 1 to 5.');
}

export async function handleMemeCommand(message) {
    try {
        const memePath = './Zero.png'; // Path to your meme image
        const memeMedia = MessageMedia.fromFilePath(memePath);
        await message.reply('Here is a meme for you!', memeMedia);
    } catch (error) {
        console.error('Error sending meme:', error);
        await message.reply(`Bro don't play around just choose a valid command.`);
    }
}
