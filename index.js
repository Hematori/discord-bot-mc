require('dotenv').config();
const discordToken = process.env.DISCORD_TOKEN;

const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require('discord.js');
const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');

process.on('uncaughtException', (err) => { console.error('خطأ:', err.message); });
process.on('unhandledRejection', (reason) => { console.error('رفض:', reason); });

let tempConfig = {
    host: '',
    port: 25565,
    username: 'haitheem',
    version: false
};

let mcBot = null;
let reconnectInterval = null;
let antiAfkInterval = null;
let isUserStopped = false;
let isBotConnected = false;

// --- [ إعدادات بوت ديسكورد ] ---
const discordClient = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const discordCommands = [
    new SlashCommandBuilder()
        .setName('connect')
        .setDescription('اتصال بالسيرفر وحفظه كإعدادات أساسية')
        .addStringOption(option =>
            option.setName('host')
                .setDescription('آيبي السيرفر (مثال: play.server.com)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('username')
                .setDescription('اسم البوت داخل اللعبة (الافتراضي: haitheem)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('version')
                .setDescription('إصدار اللعبة (مثال: 1.20.1 أو false للتلقائي)')
                .setRequired(false)),
    new SlashCommandBuilder()
        .setName('start')
        .setDescription('تشغيل البوت والدخول فوراً بآخر آيبي محفوظ'),
    new SlashCommandBuilder()
        .setName('goto')
        .setDescription('إرسال البوت إلى إحداثيات معينة (X, Y, Z) في الفارم')
        .addIntegerOption(option => option.setName('x').setDescription('إحداثيات X').setRequired(true))
        .addIntegerOption(option => option.setName('y').setDescription('إحداثيات Y').setRequired(true))
        .addIntegerOption(option => option.setName('z').setDescription('إحداثيات Z').setRequired(true)),
    new SlashCommandBuilder()
        .setName('stop')
        .setDescription('إيقاف بوت ماين كرافت وفصله عن السيرفر'),
    new SlashCommandBuilder()
        .setName('say')
        .setDescription('إرسال رسالة إلى شات سيرفر ماين كرافت')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('النص الذي تريد إرساله')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('status')
        .setDescription('معرفة حالة اتصال البوت وسيرفرك المحفوظ')
].map(command => command.toJSON());

discordClient.once('ready', async () => {
    console.log(`🤖 بوت ديسكورد يعمل الآن باسم: ${discordClient.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(discordToken);
    try {
        await rest.put(Routes.applicationCommands(discordClient.user.id), { body: discordCommands });
    } catch (error) {
        console.error('خطأ في تسجيل أوامر ديسكورد:', error);
    }
});

discordClient.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'connect') {
        await interaction.deferReply();
        const hostInput = interaction.options.getString('host');
        const usernameInput = interaction.options.getString('username') || 'haitheem';
        const versionInput = interaction.options.getString('version');

        const [ip, port] = hostInput.split(':');
        tempConfig.host = ip.trim();
        tempConfig.port = port ? parseInt(port.trim()) : 25565;
        tempConfig.username = usernameInput;
        tempConfig.version = (versionInput && versionInput.toLowerCase() !== 'false') ? versionInput : false;

        isUserStopped = false;
        await interaction.editReply(`🚀 جاري الاتصال بـ **${tempConfig.host}:${tempConfig.port}** باسم **${tempConfig.username}** وحفظ الإعدادات...`);
        launchMinecraftBot(interaction);
    }

    if (interaction.commandName === 'start') {
        await interaction.deferReply();
        if (!tempConfig.host) {
            await interaction.editReply(`❌ لم تقم بتحديد أي سيرفر من قبل! استخدم أمر \`/connect\` أولاً.`);
            return;
        }
        isUserStopped = false;
        await interaction.editReply(`🚀 جاري تشغيل بوت الماين كرافت على السيرفر المحفوظ \`${tempConfig.host}:${tempConfig.port}\`...`);
        launchMinecraftBot(interaction);
    }

    if (interaction.commandName === 'goto') {
        if (!isBotConnected || !mcBot) {
            await interaction.reply({ content: `❌ البوت غير متصل بالسيرفر حالياً لتنفيذ الأمر!`, ephemeral: true });
            return;
        }
        const x = interaction.options.getInteger('x');
        const y = interaction.options.getInteger('y');
        const z = interaction.options.getInteger('z');

        await interaction.reply({ content: `🏃‍♂️ جاري توجه البوت نحو الإحداثيات: \`X: ${x}, Y: ${y}, Z: ${z}\`...`, ephemeral: false });

        try {
            const defaultMove = new Movements(mcBot);
            mcBot.pathfinder.setMovements(defaultMove);
            const goal = new goals.GoalBlock(x, y, z);
            mcBot.pathfinder.goto(goal, (err) => {
                if (err) {
                    interaction.followUp(`⚠️ لم يتمكن البوت من الوصول للإحداثيات: ${err.message}`);
                } else {
                    interaction.followUp(`✅ وصل البوت بنجاح إلى الإحداثيات المحددة في الفارم وصار جاهزاً للـ AFK!`);
                }
            });
        } catch (e) {
            interaction.followUp(`❌ حدث خطأ أثناء تحرك البوت: ${e.message}`);
        }
    }

    if (interaction.commandName === 'stop') {
        isUserStopped = true;
        isBotConnected = false;
        if (mcBot) {
            try {
                mcBot.quit();
                mcBot = null;
                clearInterval(antiAfkInterval);
                await interaction.reply({ content: `🛑 تم إيقاف بوت الماين كرافت وفصله عن السيرفر بنجاح.`, ephemeral: false });
            } catch (e) {
                await interaction.reply({ content: `⚠️ حدث خطأ أثناء إيقاف البوت.`, ephemeral: true });
            }
        } else {
            await interaction.reply({ content: `❌ البوت غير متصل بالسيرفر أصلاً!`, ephemeral: true });
        }
    }

    if (interaction.commandName === 'say') {
        const text = interaction.options.getString('message');
        if (isBotConnected && mcBot) {
            mcBot.chat(text);
            await interaction.reply({ content: `💬 تم إرسال رسالتك لشات ماين كرافت: "${text}"`, ephemeral: false });
        } else {
            await interaction.reply({ content: `❌ البوت غير متصل بالسيرفر حالياً!`, ephemeral: true });
        }
    }

    if (interaction.commandName === 'status') {
        if (isBotConnected && mcBot && mcBot.entity) {
            const pos = `(الإحداثيات الحالية: X: ${Math.floor(mcBot.entity.position.x)}, Y: ${Math.floor(mcBot.entity.position.y)}, Z: ${Math.floor(mcBot.entity.position.z)})`;
            await interaction.reply({ content: `🟢 البوت **متصل** بسيرفر \`${tempConfig.host}\` ${pos}.`, ephemeral: false });
        } else {
            const lastHostText = tempConfig.host ? `آخر سيرفر محفوظ: \`${tempConfig.host}\`` : `لا يوجد سيرفر محفوظ بعد.`;
            await interaction.reply({ content: `🔴 البوت **غير متصل**. (${lastHostText})`, ephemeral: false });
        }
    }
});

function sendAlertToDiscord(textMessage) {
    discordClient.guilds.cache.forEach(guild => {
        const channel = guild.systemChannel || guild.channels.cache.find(ch => ch.isTextBased() && ch.permissionsFor(guild.members.me).has('SendMessages'));
        if (channel) {
            channel.send(textMessage).catch(() => {});
        }
    });
}

function launchMinecraftBot(discordTarget = null) {
    if (mcBot) {
        try { mcBot.quit(); } catch (e) {}
        mcBot = null;
    }
    clearInterval(antiAfkInterval);
    isBotConnected = false;

    const botOptions = {
        host: tempConfig.host,
        port: tempConfig.port,
        username: tempConfig.username,
        hideErrors: true
    };

    if (tempConfig.version) {
        botOptions.version = tempConfig.version;
    }

    mcBot = mineflayer.createBot(botOptions);
    mcBot.loadPlugin(pathfinder);

    mcBot.once('spawn', () => {
        isBotConnected = true;
        const successMsg = `✅ **نجح دخول البوت** (${tempConfig.username}) للسيرفر وصار متصلاً بنجاح!`;
        if (discordTarget) {
            if (typeof discordTarget.editReply === 'function') discordTarget.editReply(successMsg);
            else if (typeof discordTarget.followUp === 'function') discordTarget.followUp(successMsg);
            else if (typeof discordTarget.reply === 'function') discordTarget.reply(successMsg);
        }
        startAntiAfk();
    });

    mcBot.on('playerJoined', (player) => {
        if (player.username === mcBot.username) return;
        sendAlertToDiscord(`🟢 **اللاعب دخل:** \`${player.username}\` انضم إلى السيرفر.`);
    });

    mcBot.on('playerLeft', (player) => {
        if (player.username === mcBot.username) return;
        sendAlertToDiscord(`🔴 **اللاعب خرج:** \`${player.username}\` غادر السيرفر.`);
    });

    mcBot.on('death', () => {
        sendAlertToDiscord(`💀 **تنبيه:** البوت (${tempConfig.username}) قد مات داخل اللعبة! جاري إعادة الترسبن...`);
        setTimeout(() => { try { if (mcBot) mcBot.respawn(); } catch (e) {} }, 1500);
    });

    mcBot.on('end', (reason) => {
        clearInterval(antiAfkInterval);
        isBotConnected = false;
        if (!isUserStopped) {
            sendAlertToDiscord(`⚠️ انقطع اتصال البوت بالسيرفر. السبب: \`${reason}\`. جاري إعادة المحاولة...`);
            clearTimeout(reconnectInterval);
            reconnectInterval = setTimeout(() => launchMinecraftBot(), 15000);
        }
    });

    mcBot.on('error', () => {});
}

function startAntiAfk() {
    clearInterval(antiAfkInterval);
    antiAfkInterval = setInterval(() => {
        if (!isBotConnected || !mcBot || !mcBot.entity) return;
        try {
            const yaw = mcBot.entity.yaw + (Math.random() > 0.5 ? 0.6 : -0.6);
            mcBot.look(yaw, mcBot.entity.pitch, true);
            mcBot.setControlState('jump', true);
            setTimeout(() => { if (mcBot) mcBot.setControlState('jump', false); }, 350);
        } catch (e) {}
    }, 110000);
}

if (discordToken) {
    discordClient.login(discordToken).then(() => console.log('🤖 بوت ديسكورد يعمل بنجاح!'));
}
