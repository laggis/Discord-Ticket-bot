const { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionsBitField, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const mysql = require('mysql2');
require('dotenv').config();

const path = require('path');
const fs = require('fs');

const PANEL_STATE_PATH = path.join(__dirname, 'panel_state.json');
function loadPanelState() {
    try {
        const raw = fs.readFileSync(PANEL_STATE_PATH, 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        return null;
    }
}
function savePanelState(state) {
    try {
        fs.writeFileSync(PANEL_STATE_PATH, JSON.stringify(state, null, 2));
    } catch (e) {
        console.error('Failed to write panel state:', e);
    }
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

const token = process.env.BOT_TOKEN;
const channelId = process.env.TICKET_CHANNEL_ID;
const supportCategoryId = process.env.SUPPORT_CATEGORY_ID;
const kopCategoryId = process.env.KOP_CATEGORY_ID;
const ovrigtCategoryId = process.env.OVRIGT_CATEGORY_ID;
const panelCategoryId = process.env.PANEL_CATEGORY_ID;
const supportRoleIds = (process.env.SUPPORT_ROLE_IDS || process.env.SUPPORT_ROLE_ID || '').split(',').map(id => id.trim()).filter(Boolean);
const transcriptChannelId = process.env.TRANSCRIPT_CHANNEL_ID;
const modLogChannelId = process.env.MOD_LOG_CHANNEL_ID;
const guildId = process.env.GUILD_ID;
const ticketDeleteDelayMs = parseInt(process.env.TICKET_DELETE_DELAY_MS || '5000', 10);
const categoryMap = {
    'Support': supportCategoryId,
    'Köp': kopCategoryId,
    'Övrigt': ovrigtCategoryId,
    'Panel': panelCategoryId
};

const ticketTypes = ['Support', 'Köp', 'Övrigt', 'Panel'];

function memberHasSupportRole(member) {
    return supportRoleIds.some(id => member.roles.cache.has(id));
}

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT || '3306', 10),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

function executeQuery(query, params) {
    return new Promise((resolve, reject) => {
        pool.execute(query, params, (err, results) => {
            if (err) {
                return reject(err);
            }
            resolve(results);
        });
    });
}

function createTicketEmbed(ticketType, status, createdBy, ticketId, description) {
    const embed = new EmbedBuilder()
        .setTitle('Support Ticket Skapad')
        .setDescription('Tack för att du kontaktar oss! Din ticket har skapats framgångsrikt.')
        .setColor('#0099ff')
        .setThumbnail('https://i.imgur.com/gybi9X5.jpg')
        .addFields(
            { name: 'Ticket Typ', value: ticketType, inline: true },
            { name: 'Status', value: status, inline: true },
            { name: 'Skapad Av', value: createdBy, inline: true },
            { name: 'Ticket ID', value: ticketId, inline: false }
        )
        .addFields({ name: 'Viktig Information', value: 'Snälla förklara problemet så bra du kan, om du skriver saker som inte betyder något eller gör ett support ticket som inte förklara problemet så kan din ticket stängas', inline: false })
        .setFooter({ text: 'Använd knappen nedan för att begära att ticket stängs.' });

    if (description) {
        embed.addFields({ name: 'Beskrivning', value: description, inline: false });
    }

    return embed;
}

function createClosedTicketEmbed({ ticketId, ticketType, subject, openerTag, closedByTag, messageCount, durationMs }) {
    const durationStr = (() => {
        const seconds = Math.max(1, Math.round(durationMs / 1000));
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    })();
    const embed = new EmbedBuilder()
        .setTitle('Ticket Stängd')
        .setDescription('Din ticket har stängts. Transcript är bifogat som HTML‑fil.')
        .setColor('#ff4d4f')
        .setThumbnail('https://i.imgur.com/gybi9X5.jpg')
        .addFields(
            { name: 'Ticket ID', value: `${ticketId}`, inline: true },
            { name: 'Typ', value: `${ticketType || 'Okänd'}` , inline: true },
            { name: 'Ämne', value: `${subject || '—'}` , inline: false },
            { name: 'Skapad av', value: `${openerTag || '—'}`, inline: true },
            { name: 'Stängd av', value: `${closedByTag || '—'}`, inline: true },
            { name: 'Meddelanden', value: `${messageCount ?? 0}`, inline: true },
            { name: 'Varaktighet', value: `${durationStr}`, inline: true }
        )
        .setFooter({ text: 'Tack för att du använde vårt supportsystem!' })
        .setTimestamp();
    return embed;
}

// --- Transcript helpers ---
async function fetchAllMessages(channel, max = 1000) {
    const messages = [];
    let lastId;
    while (messages.length < max) {
        const fetched = await channel.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
        if (!fetched || fetched.size === 0) break;
        const arr = Array.from(fetched.values());
        messages.push(...arr);
        lastId = arr[arr.length - 1].id;
    }
    return messages;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function isImageAttachment(att) {
    const name = att.name || '';
    return /\.(png|jpe?g|gif|webp)$/i.test(name);
}

function generateTranscriptHTML(messages, ticketId, channel, guild) {
    const header = `<!doctype html><html><head><meta charset="utf-8"><title>Ticket ${ticketId} Transcript</title><style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#0b0f14;color:#e5e7eb;line-height:1.4;padding:16px} .header{margin-bottom:16px} .message{display:flex;gap:10px;padding:10px;border-bottom:1px solid #1f2937} .avatar{width:40px;height:40px;border-radius:50%} .author{font-weight:bold} .timestamp{color:#9ca3af;font-size:12px;margin-left:8px} .content{white-space:pre-wrap;margin-top:4px} .attachment{margin-top:6px} img{max-width:480px;border-radius:6px}</style></head><body><h1>Ticket ${ticketId} Transcript</h1><div class="header"><div>Guild: ${escapeHtml(guild?.name || '')}</div><div>Channel: ${escapeHtml(channel?.name || '')}</div></div>`;
    const bodyContent = messages
        .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
        .map(msg => {
            const attachments = msg.attachments && msg.attachments.size > 0
                ? Array.from(msg.attachments.values()).map(att => {
                    const safeName = escapeHtml(att.name || 'attachment');
                    const url = att.url;
                    const img = isImageAttachment(att)
                        ? `<div class="attachment"><img src="${url}" alt="${safeName}"></div>`
                        : `<div class="attachment"><a href="${url}" target="_blank">${safeName}</a></div>`;
                    return img;
                }).join('')
                : '';
            const contentHtml = escapeHtml(msg.content || '');
            const author = escapeHtml(`${msg.author?.tag || 'Unknown'}`);
            const avatar = msg.author?.displayAvatarURL({ size: 64, extension: 'png' }) || '';
            const time = new Date(msg.createdTimestamp).toISOString();
            return `<div class="message">
                ${avatar ? `<img class="avatar" src="${avatar}" />` : ''}
                <div class="meta">
                    <div class="header"><span class="author">${author}</span> <span class="timestamp">${time}</span></div>
                    <div class="content">${contentHtml}</div>
                    ${attachments}
                </div>
            </div>`;
        }).join('\n');
    const footer = `<div class="footer">Generated ${new Date().toISOString()}</div></body></html>`;
    return header + bodyContent + footer;
}

function parseTicketTopic(topic) {
    const info = { ticketType: null, subject: null };
    if (!topic) return info;
    const typeMatch = topic.match(/Typ:\s*([^|]+)/);
    const subjectMatch = topic.match(/Ämne:\s*(.+)$/);
    if (typeMatch) info.ticketType = typeMatch[1].trim();
    if (subjectMatch) info.subject = subjectMatch[1].trim();
    return info;
}

async function logTicketClose(channel, ticketId, closedByUser) {
    try {
        const messages = await fetchAllMessages(channel, 1000);
        const html = generateTranscriptHTML(messages, ticketId, channel, channel.guild);
        const buffer = Buffer.from(html, 'utf-8');

        // Stats
        const messageCount = messages.length;
        const startTs = messages.length ? messages[0].createdTimestamp : Date.now();
        const endTs = messages.length ? messages[messages.length - 1].createdTimestamp : Date.now();
        const durationMs = endTs - startTs;
        const { ticketType, subject } = parseTicketTopic(channel.topic || '');

        // Load ticket opener info once
        let openerId = null; let openerTag = null;
        try {
            const rows = await executeQuery('SELECT created_by_id, created_by FROM tickets WHERE id = ? LIMIT 1', [ticketId]);
            if (rows && rows.length > 0) {
                openerId = rows[0].created_by_id;
                openerTag = rows[0].created_by || null;
            }
        } catch (e) {
            console.error('Failed to load ticket opener info:', e);
        }

        // Send transcript to transcript channel
        const transcriptChannel = await client.channels.fetch(transcriptChannelId).catch(() => null);
        if (transcriptChannel) {
            await transcriptChannel.send({
                content: `Transcript för ticket ${ticketId}`,
                files: [{ attachment: buffer, name: `transcript-${ticketId}.html` }]
            });
        }

        // Try DM transcript to the ticket opener
        if (openerId) {
            try {
                const openerUser = await client.users.fetch(openerId).catch(() => null);
                if (openerUser) {
                    const dmEmbed = createClosedTicketEmbed({
                        ticketId,
                        ticketType,
                        subject,
                        openerTag: openerUser.tag || openerTag,
                        closedByTag: closedByUser?.tag || null,
                        messageCount,
                        durationMs
                    });
                    await openerUser.send({
                        content: 'Din ticket har stängts. Här är din transcript:',
                        embeds: [dmEmbed],
                        files: [{ attachment: buffer, name: `transcript-${ticketId}.html` }]
                    }).catch(() => { throw new Error('DM failed'); });
                }
            } catch (e) {
                console.warn(`Kunde inte skicka DM med transcript till ${openerId}:`, e.message || e);
                try {
                    await channel.send({ content: 'Obs: Kunde inte skicka DM med transcript till ticket‑skaparen.' });
                } catch (_) {}
            }
        }

        // Post improved closed embed in the ticket channel
        const closedEmbed = createClosedTicketEmbed({
            ticketId,
            ticketType,
            subject,
            openerTag,
            closedByTag: closedByUser?.tag || null,
            messageCount,
            durationMs
        });
        await channel.send({ embeds: [closedEmbed] });

        // Update DB status
        try {
            await executeQuery('UPDATE tickets SET status = ? WHERE id = ?', ['Stängd', ticketId]);
        } catch (e) {
            console.error('Failed to update ticket status:', e);
        }

        // Lock the ticket opener out of the channel
        try {
            if (openerId) {
                await channel.permissionOverwrites.edit(openerId, { ViewChannel: false }).catch(() => {});
            }
        } catch (e) {
            console.error('Failed to update channel permissions:', e);
        }

        // Inform and delete the ticket channel after a short delay
        const secs = Math.max(1, Math.round(ticketDeleteDelayMs / 1000));
        try {
            await channel.send({ content: `Denna kanal tas bort inom ${secs}s.` });
        } catch (_) {}
        setTimeout(async () => {
            try {
                await channel.delete('Ticket closed — cleaning up');
            } catch (e) {
                console.error('Failed to delete ticket channel:', e);
            }
        }, ticketDeleteDelayMs);
    } catch (err) {
        console.error('Failed to close ticket and generate transcript:', err);
    }
}

// --- Mod-log helpers and cooldowns ---
const cooldowns = new Map();
function isOnCooldown(key, ms) {
    const last = cooldowns.get(key);
    return last ? (Date.now() - last) < ms : false;
}
function setCooldown(key) { cooldowns.set(key, Date.now()); }
function cooldownRemaining(key, ms) {
    const last = cooldowns.get(key);
    if (!last) return 0;
    const remaining = ms - (Date.now() - last);
    return Math.max(0, Math.ceil(remaining / 1000));
}

function buildModLogEmbed({ action, actor, target, channel, ticketId, reason, details }) {
    const embed = new EmbedBuilder()
        .setTitle(`Mod Log: ${action}`)
        .setColor('#ffcc00')
        .setTimestamp();
    if (actor) embed.addFields({ name: 'Actor', value: `${actor.tag} (${actor.id})`, inline: true });
    if (target) embed.addFields({ name: 'Target', value: `${target.tag || target} (${target.id || ''})`.trim(), inline: true });
    if (channel) embed.addFields({ name: 'Channel', value: `${channel.name} (${channel.id})`, inline: true });
    if (ticketId) embed.addFields({ name: 'Ticket ID', value: `${ticketId}`, inline: true });
    if (reason) embed.addFields({ name: 'Reason', value: `${reason}`, inline: false });
    if (details) embed.addFields({ name: 'Details', value: `${details}`, inline: false });
    return embed;
}

async function sendModLog(guild, embed) {
    try {
        if (!modLogChannelId) return;
        const channel = guild.channels.cache.get(modLogChannelId) || await guild.channels.fetch(modLogChannelId).catch(() => null);
        if (channel) {
            await channel.send({ embeds: [embed] });
        } else {
            console.warn('MOD_LOG_CHANNEL_ID is set but channel not found.');
        }
    } catch (e) {
        console.error('Failed to send mod log:', e);
    }
}

client.once('ready', async () => {
    console.log(`Botten är inloggad som ${client.user.tag}`);

    const channel = await client.channels.fetch(channelId);
    if (channel) {
        // Avoid duplicate panel on restarts: prefer stored state, then fallback scan
        let alreadySent = false;

        // First try to load stored panel message id
        let panelMsg = null;
        const panelState = loadPanelState();
        if (panelState && panelState.channelId === channelId && panelState.messageId) {
            try {
                panelMsg = await channel.messages.fetch(panelState.messageId);
                if (panelMsg) {
                    alreadySent = true;
                    console.log('Panel found via stored state; skipping duplicate send.');
                }
            } catch (e) {
                console.warn('Stored panel message not found; will scan recent.', e);
            }
        }

        // Fallback: scan last 20 messages
        if (!alreadySent) {
            try {
                const recent = await channel.messages.fetch({ limit: 20 });
                for (const msg of recent.values()) {
                    if (msg.author?.id === client.user.id) {
                        const hasTicketButtons = (msg.components || []).some(row =>
                            row.components?.some(c => c.customId?.startsWith('ticket_'))
                        );
                        const hasPanelTitle = (msg.embeds || []).some(e => e.title === 'Ticket System');
                        if (hasTicketButtons && hasPanelTitle) {
                            alreadySent = true;
                            // Store message id for future restarts
                            savePanelState({ channelId, messageId: msg.id });
                            break;
                        }
                    }
                }
            } catch (e) {
                console.warn('Failed to inspect recent messages for panel duplication:', e);
            }
        }

        if (!alreadySent) {
            const embed = new EmbedBuilder()
                .setTitle('Ticket System')
                .setDescription('Välj en kategori för att skapa en ticket.')
                .setColor('#00ff00')
                .setThumbnail(client.user.displayAvatarURL() || client.user.defaultAvatarURL)
                .setFooter({ text: 'Bot av LaGgIs', iconURL: client.user.displayAvatarURL() || client.user.defaultAvatarURL })
                .setImage('https://i.imgur.com/gybi9X5.jpg')
                .addFields(
                    { name: 'Support', value: '🛠️ Få hjälp med problem.', inline: true },
                    { name: 'Köp', value: '🛒 Fråga om köp.', inline: true },
                    { name: 'Övrigt', value: '❓ Andra frågor.', inline: true },
                    { name: 'Panel', value: '🎤 Paneldiskussioner.', inline: true }
                );

            const row = new ActionRowBuilder();
            ticketTypes.forEach(type => {
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`ticket_${type}`)
                        .setLabel(type)
                        .setStyle(ButtonStyle.Primary)
                );
            });

            const sent = await channel.send({ embeds: [embed], components: [row] });
            savePanelState({ channelId, messageId: sent.id });
        } else {
            console.log('Panel already present; skipping duplicate send.');
        }
    } else {
        console.log(`Kanal med ID ${channelId} hittades inte.`);
    }

    // Register slash commands (guild if GUILD_ID set, otherwise global)
    try {
        const commands = [
            {
                name: 'ticket',
                description: 'Moderera tickets',
                type: 1,
                options: [
                    {
                        name: 'ban',
                        description: 'Banna en användare från ticketsystemet',
                        type: 1,
                        options: [
                            { name: 'user', description: 'Användare att banna', type: 6, required: true },
                            { name: 'reason', description: 'Anledning', type: 3, required: false }
                        ]
                    },
                    {
                        name: 'unban',
                        description: 'Ta bort ban från ticketsystemet',
                        type: 1,
                        options: [
                            { name: 'user', description: 'Användare att unbanna', type: 6, required: true }
                        ]
                    }
                ]
            },
            {
                name: 'close',
                description: 'Stäng en ticket via ID',
                type: 1,
                options: [
                    { name: 'ticket_id', description: 'Ticket ID', type: 3, required: true }
                ]
            }
        ];

        if (guildId) {
            const guild = await client.guilds.fetch(guildId).catch(() => null);
            if (guild) {
                await guild.commands.set(commands);
                console.log('Guild slash commands registered.');
            } else {
                console.log('GUILD_ID specificerad men guild hittades inte. Registrerar globalt.');
                await client.application.commands.set(commands);
            }
        } else {
            await client.application.commands.set(commands);
            console.log('Global slash commands registered.');
        }
    } catch (e) {
        console.error('Failed to register slash commands:', e);
    }
});


// Handle modal submission for ticket creation


client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    const { customId, guild, user, channel } = interaction;

    if (customId.startsWith('ticket_')) {
        // Check ban status before proceeding
        try {
            const bannedUsers = await executeQuery('SELECT * FROM banned_users WHERE user_id = ?', [user.id]);
            if (bannedUsers.length > 0) {
                const banInfo = bannedUsers[0];
                await sendModLog(guild, buildModLogEmbed({ action: 'BannedUserAttempt', actor: user, reason: banInfo.reason }));
                return interaction.reply({
                    content: `Du är bannad från att använda systemet. Orsak: ${banInfo.reason}`,
                    ephemeral: true
                });
            }
        } catch (err) {
            console.error('Failed to check ban status:', err);
        }

        // Prevent duplicate open tickets for this user
        try {
            const existing = await executeQuery('SELECT id FROM tickets WHERE created_by_id = ? AND status = ? LIMIT 1', [user.id, 'Öppen']);
            if (existing.length > 0) {
                return interaction.reply({ content: 'Du har redan en öppen ticket. Vänligen stäng den innan du skapar en ny.', ephemeral: true });
            }
        } catch (err) {
            console.error('Failed to check duplicate ticket:', err);
        }

        const ticketType = customId.split('_')[1];

        // Show modal to collect subject and description
        const modal = new ModalBuilder()
            .setCustomId(`create_ticket_modal_${ticketType}`)
            .setTitle('Skapa ticket');

        const subjectInput = new TextInputBuilder()
            .setCustomId('ticket_subject')
            .setLabel('Ämne')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const descriptionInput = new TextInputBuilder()
            .setCustomId('ticket_description')
            .setLabel('Beskrivning')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        const modalRow1 = new ActionRowBuilder().addComponents(subjectInput);
        const modalRow2 = new ActionRowBuilder().addComponents(descriptionInput);

        modal.addComponents(modalRow1, modalRow2);

        // Cooldown: prevent rapid ticket creation presses
        const cdKey = `ticket_create:${user.id}`;
        const cdMs = 15000;
        if (isOnCooldown(cdKey, cdMs)) {
            const remaining = cooldownRemaining(cdKey, cdMs);
            return interaction.reply({ content: `Vänligen vänta ${remaining}s innan du skapar en ny ticket.`, ephemeral: true });
        }
        setCooldown(cdKey);

        return interaction.showModal(modal);
    }

});

// Handle modal submission for ticket creation
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isModalSubmit()) return;

    if (interaction.customId.startsWith('create_ticket_modal_')) {
        const ticketType = interaction.customId.replace('create_ticket_modal_', '');
        const subject = interaction.fields.getTextInputValue('ticket_subject');
        const description = interaction.fields.getTextInputValue('ticket_description');

        try {
            const { guild, user } = interaction;
            const categoryId = categoryMap[ticketType];
            const category = guild.channels.cache.get(categoryId);
            const supportRoles = supportRoleIds.map(id => guild.roles.cache.get(id)).filter(Boolean);

            if (!category) {
                return interaction.reply({ content: `${ticketType} ticket kategori hittades inte.`, ephemeral: true });
            }

            // Duplicate check again to be safe
            const existing = await executeQuery('SELECT id FROM tickets WHERE created_by_id = ? AND status = ? LIMIT 1', [user.id, 'Öppen']);
            if (existing.length > 0) {
                return interaction.reply({ content: 'Du har redan en öppen ticket. Vänligen stäng den innan du skapar en ny.', ephemeral: true });
            }

            const overwrites = [
                {
                    id: guild.roles.everyone.id,
                    deny: [PermissionsBitField.Flags.ViewChannel],
                },
                {
                    id: user.id,
                    allow: [PermissionsBitField.Flags.ViewChannel],
                }
            ];
            if (supportRoles.length) {
                supportRoles.forEach(r => overwrites.push({ id: r.id, allow: [PermissionsBitField.Flags.ViewChannel] }));
            }

            const ticketId = uuidv4();
            const ticketChannel = await guild.channels.create({
                name: `ticket-${user.username}`,
                type: ChannelType.GuildText,
                parent: category,
                permissionOverwrites: overwrites,
                topic: `ID: ${ticketId} | Typ: ${ticketType} | Ämne: ${subject}`
            });

            const embed = createTicketEmbed(ticketType, 'Öppen', user.toString(), ticketId, description);

            const closeButton = new ButtonBuilder()
                .setCustomId(`close_ticket_${ticketId}`)
                .setLabel('Stäng ticket')
                .setStyle(ButtonStyle.Danger);

            const row = new ActionRowBuilder().addComponents(closeButton);

            await ticketChannel.send({ embeds: [embed], components: [row] });

            const query = 'INSERT INTO tickets (id, type, status, created_by, created_by_id) VALUES (?, ?, ?, ?, ?)';
            try {
                await executeQuery(query, [ticketId, ticketType, 'Öppen', user.username, user.id]);
                console.log('Ticket saved to the database.');
            } catch (err) {
                console.error('Failed to save the ticket to the database:', err);
            }

            await interaction.reply({ content: `${ticketType} ticket har skapats: ${ticketChannel}`, ephemeral: true });
            await ticketChannel.send(`${user} har öppnat en ${ticketType} ticket.`);
            if (supportRoles.length) {
                const mentions = supportRoles.map(r => r.toString()).join(' ');
                await ticketChannel.send(`${mentions} kommer att assistera dig snart.`);
            }
        } catch (error) {
            console.error('An error occurred while creating ticket from modal:', error);
            try {
                await interaction.reply({ content: 'Ett fel inträffade vid skapande av ticket.', ephemeral: true });
            } catch (_) {}
        }
    }
});



client.login(token);

// Handle slash commands
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (!interaction.inGuild()) {
        return interaction.reply({ content: 'Kommandon måste användas i servern.', ephemeral: true });
    }

    if (interaction.commandName === 'ticket') {
        const sub = interaction.options.getSubcommand();
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
            return interaction.reply({ content: 'Du har inte behörighet att använda detta kommando.', ephemeral: true });
        }

        // Cooldown for staff moderation commands
        const staffCdKey = `staff_cmd:${interaction.user.id}`;
        const staffCdMs = 5000;
        if (isOnCooldown(staffCdKey, staffCdMs)) {
            const remaining = cooldownRemaining(staffCdKey, staffCdMs);
            return interaction.reply({ content: `Vänligen vänta ${remaining}s innan du använder mod-kommandon.`, ephemeral: true });
        }
        setCooldown(staffCdKey);

        if (sub === 'ban') {
            const userToBan = interaction.options.getUser('user', true);
            const reason = interaction.options.getString('reason') || 'No reason provided';
            try {
                await executeQuery('INSERT INTO banned_users (user_id, reason, banned_by) VALUES (?, ?, ?)', [userToBan.id, reason, interaction.user.id]);
                await interaction.reply({ content: `${userToBan.tag} har blivit bannad: ${reason}`, ephemeral: true });
                await sendModLog(interaction.guild, buildModLogEmbed({ action: 'BanUser', actor: interaction.user, target: userToBan, reason }));
            } catch (err) {
                console.error('Failed to ban user:', err);
                if (err.code === 'ER_DUP_ENTRY') {
                    await interaction.reply({ content: 'Användaren är redan bannad.', ephemeral: true });
                } else {
                    await interaction.reply({ content: 'Misslyckades att banna användaren.', ephemeral: true });
                }
            }
        } else if (sub === 'unban') {
            const user = interaction.options.getUser('user', true);
            try {
                const result = await executeQuery('DELETE FROM banned_users WHERE user_id = ?', [user.id]);
                if (result.affectedRows > 0) {
                    await interaction.reply({ content: `Användaren ${user.tag} har blivit unbannad.`, ephemeral: true });
                    await sendModLog(interaction.guild, buildModLogEmbed({ action: 'UnbanUser', actor: interaction.user, target: user }));
                } else {
                    await interaction.reply({ content: 'Ingen sådan användare finns i banlistan.', ephemeral: true });
                }
            } catch (err) {
                console.error('Failed to unban user:', err);
                await interaction.reply({ content: 'Misslyckades att unbanna användaren.', ephemeral: true });
            }
        }
    } else if (interaction.commandName === 'close') {
        const ticketId = interaction.options.getString('ticket_id', true);
        try {
            const member = await interaction.guild.members.fetch(interaction.user.id);
            if (!memberHasSupportRole(member)) {
                return interaction.reply({ content: 'Du har inte behörighet att stänga tickets.', ephemeral: true });
            }

            const ticketChannel = interaction.guild.channels.cache.find(ch => ch.type === ChannelType.GuildText && ch.topic && ch.topic.includes(`ID: ${ticketId}`));
            if (!ticketChannel) {
                return interaction.reply({ content: 'Ticket-kanal hittades inte för angivet ID.', ephemeral: true });
            }

            const cdKey = `ticket_close:${interaction.user.id}`;
            const cdMs = 5000;
            if (isOnCooldown(cdKey, cdMs)) {
                const remaining = cooldownRemaining(cdKey, cdMs);
                return interaction.reply({ content: `Vänligen vänta ${remaining}s innan du stänger tickets.`, ephemeral: true });
            }
            setCooldown(cdKey);

            await interaction.deferReply({ ephemeral: true });
            await logTicketClose(ticketChannel, ticketId, interaction.user);
            await interaction.editReply({ content: `Ticket ${ticketId} stängd.` });

            await sendModLog(interaction.guild, buildModLogEmbed({
                action: 'CloseTicket',
                actor: interaction.user,
                channel: ticketChannel,
                ticketId
            }));
        } catch (err) {
            console.error('Failed to close ticket via command:', err);
            try {
                await interaction.reply({ content: 'Misslyckades att stänga ticket.', ephemeral: true });
            } catch (_) {}
        }
    }
});

// Harden permissions on close button: require support role
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    const { customId, guild, user, channel } = interaction;

    if (customId.startsWith('close_ticket')) {
        try {
            await interaction.deferReply({ ephemeral: true });
            const ticketId = customId.split('_')[2];
            const member = await guild.members.fetch(user.id);
            if (!memberHasSupportRole(member)) {
                await sendModLog(guild, buildModLogEmbed({
                    action: 'UnauthorizedCloseAttempt',
                    actor: user,
                    channel,
                    ticketId
                }));
                return interaction.editReply({ content: 'Du har inte behörighet att stänga denna ticket.', ephemeral: true });
            }

            const cdKey = `ticket_close:${user.id}`;
            const cdMs = 5000;
            if (isOnCooldown(cdKey, cdMs)) {
                const remaining = cooldownRemaining(cdKey, cdMs);
                return interaction.editReply({ content: `Vänligen vänta ${remaining}s innan du stänger tickets. (${remaining}s)`, ephemeral: true });
            }
            setCooldown(cdKey);

            if (channel.name.includes('ticket')) {
                await logTicketClose(channel, ticketId, user);
                await interaction.editReply({ content: 'Ticket stängd.' });

                await sendModLog(guild, buildModLogEmbed({
                    action: 'CloseTicket',
                    actor: user,
                    channel,
                    ticketId
                }));
            } else {
                await interaction.editReply({ content: 'Detta är inte en ticket-kanal.', ephemeral: true });
            }
        } catch (error) {
            console.error('An error occurred while closing ticket:', error);
        }
    }
});