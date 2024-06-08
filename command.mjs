import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config({ path: 'token.env' });

const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const TOKEN = process.env.DISCORD_TOKEN;

const commands = [
    {
        name: '가입하기',
        description: '가입',
    },
    {
        name: '내정보',
        description: '내정보',
    },
    {
        name: '방생성',
        description: '게임방을 생성합니다.',
        options: [
            {
                name: '게임',
                description: '플레이 할 게임을 선택해주세요.',
                type: 3,
                required: true,
                choices: [
                    {
                        name: '반응속도',
                        value: '반응속도'
                    }
                ]
            }
        ]
    }
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });

    console.log('Successfully reloaded application (/) commands.');
} catch (error) {
    console.error(error);
}