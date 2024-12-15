const { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, EmbedBuilder, PermissionsBitField, ChannelType } = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const mysql = require('mysql2');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

const token = ''; // Replace with your bot token
const channelId = ''; // Replace with your ticket channel ID
const supportCategoryId = ''; // Replace with your Support category ID
const kopCategoryId = ''; // Replace with your Köp category ID
const ovrigtCategoryId = ''; // Replace with your Övrigt category ID
const panelCategoryId = ''; // Replace with your Panel category ID
const supportRoleId = ''; // Replace with your support role ID
const transcriptChannelId = ''; // Replace with the channel ID where transcripts should be sent

const categoryMap = {
    'Support': supportCategoryId,
    'Köp': kopCategoryId,
    'Övrigt': ovrigtCategoryId,
    'Panel': panelCategoryId
};

const ticketTypes = ['Support', 'Köp', 'Övrigt', 'Panel'];

const pool = mysql.createPool({
    host: 'localhost',
    user: 'Discordbot',
    password: 'Discordbot',
    database: 'discordbot',
    port: 3306, // Change to port 3307
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

function createClosedTicketEmbed(ticketId) {
    const embed = new EmbedBuilder()
        .setTitle('Ticket Stängd')
        .setDescription(`Din ticket har stängts. Här är din transcript med ID: ${ticketId}:`)
        .setColor('#ff0000')
        .setThumbnail('https://i.imgur.com/gybi9X5.jpg')
        .addFields(
            { name: 'Ticket ID', value: ticketId, inline: false }
        )
        .setFooter({ text: 'Tack för att du använde vårt supportsystem!' });
    return embed;
}

client.once('ready', async () => {
    console.log(`Botten är inloggad som ${client.user.tag}`);

    const channel = await client.channels.fetch(channelId);
    if (channel) {
        const embed = new EmbedBuilder()
            .setTitle('Ticket System')
            .setDescription('Välj en kategori för att skapa en ticket.')
            .setColor('#00ff00')
            .setThumbnail(client.user.avatarURL() || client.user.defaultAvatarURL)
            .setFooter({ text: 'Bot av LaGgIs', iconURL: client.user.avatarURL() || client.user.defaultAvatarURL })
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
                    .setStyle('Primary')
            );
        });

        await channel.send({ embeds: [embed], components: [row] });
    } else {
        console.log(`Kanal med ID ${channelId} hittades inte.`);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    try {
        await interaction.deferReply({ ephemeral: true });  // Defer the interaction to avoid timeout

        const { customId, guild, user, channel } = interaction;

        if (customId.startsWith('ticket_')) {
            const ticketType = customId.split('_')[1];
            const categoryId = categoryMap[ticketType];
            const category = guild.channels.cache.get(categoryId);
            const supportRole = guild.roles.cache.get(supportRoleId);

            if (!category) {
                await interaction.editReply({ content: `${ticketType} ticket kategori hittades inte.`, ephemeral: true });
                return;
            }

            const overwrites = [
                {
                    id: guild.roles.everyone.id,
                    deny: [PermissionsBitField.Flags.ViewChannel],
                },
                {
                    id: user.id,
                    allow: [PermissionsBitField.Flags.ViewChannel],
                },
                {
                    id: supportRole.id,
                    allow: [PermissionsBitField.Flags.ViewChannel],
                },
            ];

            const ticketChannel = await guild.channels.create({
                name: `ticket-${user.username}`,
                type: ChannelType.GuildText,
                parent: category,
                permissionOverwrites: overwrites,
            });

            const ticketId = uuidv4();
            const embed = createTicketEmbed(ticketType, 'Öppen', user.toString(), ticketId);

            const closeButton = new ButtonBuilder()
                .setCustomId(`close_ticket_${ticketId}`)
                .setLabel('Stäng ticket')
                .setStyle('Danger');

            const row = new ActionRowBuilder().addComponents(closeButton);

            await ticketChannel.send({ embeds: [embed], components: [row] });

            const query = 'INSERT INTO tickets (id, type, status, created_by, created_by_id) VALUES (?, ?, ?, ?, ?)';
            try {
                await executeQuery(query, [ticketId, ticketType, 'Öppen', user.username, user.id]);
                console.log('Ticket saved to the database.');
            } catch (err) {
                console.error('Failed to save the ticket to the database:', err);
            }

            await interaction.editReply({ content: `${ticketType} ticket har skapats: ${ticketChannel}`, ephemeral: true });
            await ticketChannel.send(`${user} har öppnat en ${ticketType} ticket.`);
            await ticketChannel.send(`${supportRole} kommer att assistera dig snart.`);
        }

        if (customId.startsWith('close_ticket')) {
            const ticketId = customId.split('_')[2];
            if (channel.name.includes('ticket')) {
                await logTicketClose(channel, ticketId);
            } else {
                await interaction.editReply({ content: 'Du har inte behörighet att stänga denna ticket.', ephemeral: true });
            }
        }
    } catch (error) {
        if (error.status === 503) {
            console.log('Discord API is unavailable. Retrying in a few seconds...');
            setTimeout(async () => {
                try {
                    await interaction.deferReply({ ephemeral: true });  // Retry the interaction
                } catch (retryError) {
                    console.error('Retry failed:', retryError);
                }
            }, 5000);  // Retry after 5 seconds
        } else {
            console.error('An error occurred:', error);
        }
    }
});

async function logTicketClose(channel, ticketId) {
    try {
        const messages = await channel.messages.fetch();
        const transcript = messages.map(msg => `${msg.author.username}: ${msg.content}`).join('\n');

        const query = 'SELECT created_by_id, created_by FROM tickets WHERE id = ?';
        const results = await executeQuery(query, [ticketId]);

        if (results.length > 0) {
            const creatorId = results[0].created_by_id;
            const creatorUsername = results[0].created_by;
            const creator = await client.users.fetch(creatorId);

            if (creator) {
                const embed = createClosedTicketEmbed(ticketId);

                const transcriptChannel = await client.channels.fetch(transcriptChannelId);
                await transcriptChannel.send(`Transcript for ticket ID: ${ticketId}`);
                await transcriptChannel.send({ 
                    files: [{ attachment: Buffer.from(transcript, 'utf-8'), name: `transcript-${creatorUsername}.txt` }] 
                });

                await creator.send({ 
                    embeds: [embed], 
                    files: [{ attachment: Buffer.from(transcript, 'utf-8'), name: `transcript-${creatorUsername}.txt` }] 
                });

                const updateQuery = 'UPDATE tickets SET status = ? WHERE id = ?';
                await executeQuery(updateQuery, ['Stängd', ticketId]);

                await channel.delete();
            } else {
                console.error('Failed to fetch the ticket creator from Discord.');
            }
        } else {
            console.error('No ticket found with the specified ID.');
        }
    } catch (error) {
        console.error('An error occurred:', error);
    }
}

client.on('messageCreate', async (message) => {
    if (!message.guild || message.author.bot) return;

    const args = message.content.split(' ');
    const command = args.shift().toLowerCase();

    // Ban command
    if (command === '!ban') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
            return message.reply('You do not have permission to use this command.');
        }

        const userToBan = message.mentions.users.first();
        const reason = args.slice(1).join(' ') || 'No reason provided';

        if (!userToBan) {
            return message.reply('Please mention a user to ban.');
        }

        const query = 'INSERT INTO banned_users (user_id, reason, banned_by) VALUES (?, ?, ?)';
        try {
            await executeQuery(query, [userToBan.id, reason, message.author.id]);
            message.reply(`${userToBan.tag} has been banned for: ${reason}`);
        } catch (err) {
            console.error('Failed to ban user:', err);
            message.reply('Failed to ban the user. They may already be banned.');
        }
    }

    // Unban command
    if (command === '!unban') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
            return message.reply('You do not have permission to use this command.');
        }

        const userId = args[0];
        if (!userId) {
            return message.reply('Please provide the ID of the user to unban.');
        }

        const query = 'DELETE FROM banned_users WHERE user_id = ?';
        try {
            const result = await executeQuery(query, [userId]);
            if (result.affectedRows > 0) {
                message.reply(`User with ID ${userId} has been unbanned.`);
            } else {
                message.reply('No such user found in the ban list.');
            }
        } catch (err) {
            console.error('Failed to unban user:', err);
            message.reply('Failed to unban the user.');
        }
    }
});

client.on('messageCreate', async (message) => {
    if (!message.guild || message.author.bot) return;

    const args = message.content.split(' ');
    const command = args.shift().toLowerCase();

    // Ban command
    if (command === '!ticketban') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
            return message.reply('You do not have permission to use this command.');
        }

        const userToBan = message.mentions.users.first();
        const reason = args.slice(1).join(' ') || 'No reason provided';

        if (!userToBan) {
            return message.reply('Please mention a user to ban.');
        }

        const query = 'INSERT INTO banned_users (user_id, reason, banned_by) VALUES (?, ?, ?)';
        try {
            await executeQuery(query, [userToBan.id, reason, message.author.id]);
            message.reply(`${userToBan.tag} has been banned for: ${reason}`);
        } catch (err) {
            console.error('Failed to ban user:', err);
            message.reply('Failed to ban the user. They may already be banned.');
        }
    }

    // Unban command
    if (command === '!ticketunban') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
            return message.reply('You do not have permission to use this command.');
        }

        const userId = args[0];
        if (!userId) {
            return message.reply('Please provide the ID of the user to unban.');
        }

        const query = 'DELETE FROM banned_users WHERE user_id = ?';
        try {
            const result = await executeQuery(query, [userId]);
            if (result.affectedRows > 0) {
                message.reply(`User with ID ${userId} has been unbanned.`);
            } else {
                message.reply('No such user found in the ban list.');
            }
        } catch (err) {
            console.error('Failed to unban user:', err);
            message.reply('Failed to unban the user.');
        }
    }
});

// Prevent banned users from creating tickets
client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton() && interaction.customId.startsWith('ticket_')) {
        const query = 'SELECT * FROM banned_users WHERE user_id = ?';
        const bannedUsers = await executeQuery(query, [interaction.user.id]);

        if (bannedUsers.length > 0) {
            const banInfo = bannedUsers[0];
            return interaction.reply({
                content: `You are banned from using this system. Reason: ${banInfo.reason}`,
                ephemeral: true
            });
        }

        // Proceed with existing ticket creation logic
    }
});


client.login(token);