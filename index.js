const telegramToken = '8998161096:AAF14FgTdFn58LQDr0JZ4iEv1F3QyW1h5W4';
const discordToken = 'MTU0MTkwNzIzMzg5MjQ3NDkyMA.GN_sEi.23zeWjQv0BIjYwEJsYRdxoY_30gYd2aBS3FfF4';

const { Telegraf, Markup } = require('telegraf');
const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require('discord.js');
const mineflayer = require('mineflayer');

process.on('uncaughtException', (err) => { console.error('خطأ:', err.message); });
process.on('unhandledRejection', (reason) => { console.error('رفض:', reason); });

// --- [ إعدادات بوت تيليجرام ] ---
const telegramBot = new Telegraf(telegramToken);
let activeTelegramCtx = null;
let isUserStopped = false;
let userState = null; 

let tempConfig = {
    host: 'mdgames.wither.host',
    port: 25565,
    username: 'haitheem',
    version: false,
    authType: 'none', 
    password: ''
};

let mcBot = null;
let reconnectInterval = null;
let antiAfkInterval = null;

function getPermanentMenu() {
    return Markup.keyboard([
        ['🚀 تشغيل البوت', '⚙️ إعدادات السيرفر'],
        ['🛑 إيقاف البوت', '📍 الإحداثيات']
    ]).resize();
}

telegramBot.telegram.setMyCommands([
    { command: 'start', description: 'تشغيل البوت ولوحة التحكم' },
    { command: 'config', description: 'تعديل إعدادات السيرفر والاسم' },
    { command: 'stopbot', description: 'إيقاف البوت' },
    { command: 'coords', description: 'معرفة الإحداثيات' },
    { command: 'say', description: 'إرسال رسالة داخل شات ماين كرافت (مثال: /say hello)' }
]).catch(() => {});

telegramBot.start((ctx) => {
    activeTelegramCtx = ctx;
    userState = null;
    ctx.reply(
        `🎮 أهلاً بك في لوحة تحكم ماين كرافت (تيليجرام)!\n\n` +
        `🔹 **السيرفر الحالي:** ${tempConfig.host}:${tempConfig.port}\n` +
        `🔹 **اسم البوت:** ${tempConfig.username}\n` +
        `🔹 **الإصدار:** ${tempConfig.version || 'تلقائي (Auto)'}\n\n` +
        `اختر من الأزرار بالأسفل للتحكم:`,
        getPermanentMenu()
    );
});

telegramBot.command('say', (ctx) => {
    const text = ctx.message.text.replace('/say', '').trim();
    if (!text) {
        return ctx.reply('⚠️ اكتب النص بعد الأمر، مثل: `/say السلام عليكم`', getPermanentMenu());
    }
    if (mcBot) {
        mcBot.chat(text);
        ctx.reply(`💬 تم إرسالها لشات اللعبة: "${text}"`, getPermanentMenu());
    } else {
        ctx.reply('❌ البوت غير متصل بالسيرفر حالياً!', getPermanentMenu());
    }
});

telegramBot.hears('⚙️ إعدادات السيرفر', (ctx) => {
    userState = 'WAITING_FOR_HOST_PORT';
    ctx.reply(
        `🛠️ **تعديل إعدادات السيرفر**\n\n` +
        `أرسل **الآيبي والبورت** بهذا الشكل:\n` +
        `\`ip:port\` (مثال: \`play.example.com:25565\` أو الآيبي فقط)\n` +
        `(أو أرسل \`skip\` للإبقاء على الحالي: \`${tempConfig.host}:${tempConfig.port}\`)`,
        { parse_mode: 'Markdown', reply_markup: Markup.removeKeyboard() }
    );
});

telegramBot.hears('🛑 إيقاف البوت', (ctx) => { stopBotAction(ctx); });
telegramBot.command('stopbot', (ctx) => { stopBotAction(ctx); });

function stopBotAction(ctx) {
    activeTelegramCtx = ctx;
    isUserStopped = true;
    clearTimeout(reconnectInterval);
    clearTimeout(antiAfkInterval);

    if (mcBot) {
        try {
            mcBot.quit();
            mcBot = null;
            if (ctx) ctx.reply('🛑 تم إيقاف البوت وفصله عن السيرفر بنجاح.', getPermanentMenu());
        } catch (e) {
            if (ctx) ctx.reply('⚠️ البوت متوقف بالفعل.', getPermanentMenu());
        }
    } else {
        if (ctx) ctx.reply('❌ البوت ليس متصلاً أصلاً.', getPermanentMenu());
    }
}

telegramBot.hears('📍 الإحداثيات', (ctx) => { sendCoordsAction(ctx); });
telegramBot.command('coords', (ctx) => { sendCoordsAction(ctx); });

function sendCoordsAction(ctx) {
    if (mcBot && mcBot.entity && mcBot.entity.position) {
        const pos = mcBot.entity.position;
        ctx.reply(`📍 **الإحداثيات الحالية:**\n- X: \`${Math.round(pos.x)}\`\n- Y: \`${Math.round(pos.y)}\`\n- Z: \`${Math.round(pos.z)}\``, getPermanentMenu());
    } else {
        ctx.reply('❌ البوت غير متصل بالسيرفر حالياً!', getPermanentMenu());
    }
}

telegramBot.hears('🚀 تشغيل البوت', (ctx) => {
    activeTelegramCtx = ctx;
    isUserStopped = false;
    userState = null;
    ctx.reply(
        `🚀 جاري تشغيل البوت على:\n` +
        `🌐 السيرفر: \`${tempConfig.host}:${tempConfig.port}\`\n` +
        `👤 الاسم: \`${tempConfig.username}\`\n` +
        `📦 الإصدار: \`${tempConfig.version || 'تلقائي'}\`...`,
        { parse_mode: 'Markdown', ...getPermanentMenu() }
    );
    launchMinecraftBot(ctx, null);
});

telegramBot.on('text', (ctx) => {
    activeTelegramCtx = ctx;
    const text = ctx.message.text ? ctx.message.text.trim() : '';
    if (text.startsWith('/')) return;

    if (text.includes('تشغيل البوت') || text.includes('إيقاف البوت') || text.includes('الإحداثيات') || text.includes('إعدادات السيرفر')) {
        return;
    }

    if (userState === 'WAITING_FOR_HOST_PORT') {
        if (text.toLowerCase() !== 'skip') {
            if (text.includes(':')) {
                const parts = text.split(':');
                tempConfig.host = parts[0].trim();
                tempConfig.port = parseInt(parts[1].trim()) || 25565;
            } else {
                tempConfig.host = text;
                tempConfig.port = 25565;
            }
        }
        userState = 'WAITING_FOR_USERNAME';
        return ctx.reply(`أرسل **اسم البوت** داخل اللعبة (أو اكتب \`skip\` للإبقاء على \`${tempConfig.username}\`):`, { parse_mode: 'Markdown' });
    }

    if (userState === 'WAITING_FOR_USERNAME') {
        if (text.toLowerCase() !== 'skip') tempConfig.username = text;
        userState = 'WAITING_FOR_VERSION';
        return ctx.reply(`أرسل **إصدار ماين كرافت بدقة** (مثل \`1.20.1\` أو \`false\` للإصدار التلقائي):`, { parse_mode: 'Markdown' });
    }

    if (userState === 'WAITING_FOR_VERSION') {
        tempConfig.version = (text.toLowerCase() === 'false' || text.toLowerCase() === 'skip') ? false : text;
        userState = 'WAITING_FOR_AUTH';
        return ctx.reply(
            `هل يتطلب السيرفر تسجيل دخول؟\n` +
            `اختر نوع الدخول: \`register\` أو \`login\` أو \`none\``,
            { parse_mode: 'Markdown' }
        );
    }

    if (userState === 'WAITING_FOR_AUTH') {
        const auth = text.toLowerCase();
        if (['register', 'login', 'none'].includes(auth)) {
            tempConfig.authType = auth;
            if (auth === 'none') {
                userState = null;
                return ctx.reply(`✅ تم حفظ الإعدادات بنجاح!\n\nاضغط على **🚀 تشغيل البوت** للدخول.`, getPermanentMenu());
            } else {
                userState = 'WAITING_FOR_PASSWORD';
                return ctx.reply(`أرسل **كلمة المرور (Password)** الخاصة بالحساب:`, { parse_mode: 'Markdown' });
            }
        } else {
            return ctx.reply('❌ خيار غير صحيح. اكتب: `register` أو `login` أو `none`');
        }
    }

    if (userState === 'WAITING_FOR_PASSWORD') {
        tempConfig.password = text;
        userState = null;
        return ctx.reply(`✅ تم حفظ كافة الإعدادات! اضغط على **🚀 تشغيل البوت** للدخول.`, { parse_mode: 'Markdown', ...getPermanentMenu() });
    }
});


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
        .setDescription('تشغيل بوت ماين كرافت والاتصال بسيرفر مع تحديد الآيبي، الإصدار، واسم اللاعب')
        .addStringOption(option =>
            option.setName('host')
                .setDescription('أيب السيرفر (مثال: play.server.com أو ip:port)')
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
        .setName('say')
        .setDescription('إرسال رسالة إلى شات سيرفر ماين كرافت عبر البوت')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('النص الذي تريد إرساله في شات اللعبة')
                .setRequired(true))
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
        const hostInput = interaction.options.getString('host');
        const usernameInput = interaction.options.getString('username') || 'haitheem';
        const versionInput = interaction.options.getString('version');

        const [ip, port] = hostInput.split(':');
        tempConfig.host = ip.trim();
        tempConfig.port = port ? parseInt(port.trim()) : 25565;
        tempConfig.username = usernameInput;
        tempConfig.version = (versionInput && versionInput.toLowerCase() !== 'false') ? versionInput : false;

        isUserStopped = false;
        await interaction.reply(`🚀 جاري الاتصال بـ **${tempConfig.host}:${tempConfig.port}** باسم **${tempConfig.username}**...`);
        launchMinecraftBot(null, interaction);
    }

    if (interaction.commandName === 'say') {
        const text = interaction.options.getString('message');
        if (mcBot) {
            mcBot.chat(text);
            await interaction.reply(`💬 تم إرسال رسالتك لشات ماين كرافت: "${text}"`);
        } else {
            await interaction.reply(`❌ البوت غير متصل بالسيرفر حالياً!`);
        }
    }
});

discordClient.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (message.content === '!startmc') {
        isUserStopped = false;
        message.reply(`🚀 جاري تشغيل بوت الماين كرافت على سيرفر \`${tempConfig.host}\`...`);
        launchMinecraftBot(null, message);
    }
    if (message.content === '!stopmc') {
        isUserStopped = true;
        if (mcBot) {
            try { mcBot.quit(); mcBot = null; message.reply('🛑 تم إيقاف بوت الماين كرافت بنجاح.'); } catch (e) {}
        } else {
            message.reply('❌ البوت غير متصل أصلاً.');
        }
    }
});

// دالة عامة لإرسال التنبيهات لتليجرام وديسكورد معاً
function sendAlertToPlatforms(textMessage) {
    // إرسال لتليجرام لو كان مفعل
    if (activeTelegramCtx) {
        activeTelegramCtx.reply(textMessage).catch(() => {});
    }
    // إرسال لأحدث قناة ديسكورد تفاعل معها البوت (اختياري، أو يمكنك تحديد قناة ثابتة)
    discordClient.guilds.cache.forEach(guild => {
        const channel = guild.systemChannel || guild.channels.cache.find(ch => ch.isTextBased() && ch.permissionsFor(guild.members.me).has('SendMessages'));
        if (channel) {
            channel.send(textMessage).catch(() => {});
        }
    });
}


// --- [ دالة تشغيل بوت ماين كرافت والتقاط الأحداث ] ---
function launchMinecraftBot(telegramCtx = null, discordTarget = null) {
    if (mcBot) {
        try { mcBot.quit(); } catch (e) {}
        mcBot = null;
    }
    clearInterval(antiAfkInterval);

    const botOptions = {
        host: tempConfig.host,
        port: tempConfig.port,
        username: tempConfig.username,
        hideErrors: true
    };

    if (tempConfig.version) {
        botOptions.version = tempConfig.version;
    }

    let isConnected = false;
    mcBot = mineflayer.createBot(botOptions);

    mcBot.once('spawn', () => {
        isConnected = true;
        const successMsg = `✅ **نجح دخول البوت** (${tempConfig.username}) للسيرفر وصار متصلاً بنجاح!`;
        if (telegramCtx) telegramCtx.reply(successMsg, getPermanentMenu());
        if (discordTarget) {
            if (typeof discordTarget.followUp === 'function') discordTarget.followUp(successMsg);
            else if (typeof discordTarget.reply === 'function') discordTarget.reply(successMsg);
        }

        if (tempConfig.authType !== 'none' && tempConfig.password) {
            setTimeout(() => {
                if (mcBot) {
                    if (tempConfig.authType === 'register') mcBot.chat(`/register ${tempConfig.password} ${tempConfig.password}`);
                    else if (tempConfig.authType === 'login') mcBot.chat(`/login ${tempConfig.password}`);
                }
            }, 3500);
        }

        startAntiAfk();
    });

    // 1. مراقبة شات اللعبة والرسائل العامة
    mcBot.on('messagestr', (message) => {
        if (!message) return;
        // تجاهل رسائل البوت نفسه إذا أردت، أو عرضها
        console.log(`[MC Chat]: ${message}`);
    });

    // 2. مراقبة دخول اللاعبين للسيرفر
    mcBot.on('playerJoined', (player) => {
        if (player.username === mcBot.username) return;
        sendAlertToPlatforms(`🟢 **اللاعب دخل:** \`${player.username}\` انضم إلى السيرفر.`);
    });

    // 3. مراقبة خروج اللاعبين من السيرفر
    mcBot.on('playerLeft', (player) => {
        if (player.username === mcBot.username) return;
        sendAlertToPlatforms(`🔴 **اللاعب خرج:** \`${player.username}\` غادر السيرفر.`);
    });

    // 4. مراقبة موت البوت أو اللاعبين المرئيين
    mcBot.on('death', () => {
        sendAlertToPlatforms(`💀 **تنبيه:** البوت (${tempConfig.username}) قد مات داخل اللعبة! جاري إعادة الترسبن...`);
        setTimeout(() => { try { if (mcBot) mcBot.respawn(); } catch (e) {} }, 1500);
    });

    mcBot.on('end', (reason) => {
        clearInterval(antiAfkInterval);
        if (isConnected && !isUserStopped) {
            sendAlertToPlatforms(`⚠️ انقطع اتصال البوت بالسيرفر. السبب: \`${reason}\`. جاري إعادة المحاولة...`);
        }
        isConnected = false;
        if (!isUserStopped) {
            clearTimeout(reconnectInterval);
            reconnectInterval = setTimeout(() => launchMinecraftBot(), 15000);
        }
    });

    mcBot.on('error', () => {});
}

function startAntiAfk() {
    clearInterval(antiAfkInterval);
    antiAfkInterval = setInterval(() => {
        if (!mcBot || !mcBot.entity) return;
        try {
            const yaw = mcBot.entity.yaw + (Math.random() > 0.5 ? 0.6 : -0.6);
            mcBot.look(yaw, mcBot.entity.pitch, true);
            mcBot.setControlState('jump', true);
            setTimeout(() => { if (mcBot) mcBot.setControlState('jump', false); }, 350);
        } catch (e) {}
    }, 110000);
}

// تشغيل البوتات معاً
telegramBot.launch().then(() => console.log('🤖 بوت تيليجرام يعمل بنجاح!'));
if (discordToken) {
    discordClient.login(discordToken).then(() => console.log('🤖 بوت ديسكورد يعمل بنجاح!'));
}