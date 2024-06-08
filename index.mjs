import { ActionRowBuilder, ButtonBuilder } from '@discordjs/builders';
import { Client, GatewayIntentBits, EmbedBuilder, ChannelType, ButtonStyle } from 'discord.js';
import sqlite3 from 'sqlite3';
import dotenv from 'dotenv';

dotenv.config({ path: 'env/token.env' });

const TOKEN = process.env.DISCORD_TOKEN;

const user = new sqlite3.Database('db/user.db');
const data = new sqlite3.Database('db/data.db');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });


client.on('ready', () => {
    console.log(`Success`);
});

const startBtn = new ButtonBuilder()
    .setCustomId('게임시작')
    .setLabel('게임시작')
    .setStyle(ButtonStyle.Primary);

const removeBtn = new ButtonBuilder()
    .setCustomId('취소')
    .setLabel('취소')
    .setStyle(ButtonStyle.Secondary);

const joinBtn = new ButtonBuilder()
    .setCustomId('참가')
    .setLabel('참가')
    .setStyle(ButtonStyle.Success);

const leaveBtn = new ButtonBuilder()
    .setCustomId('나가기')
    .setLabel('나가기')
    .setStyle(ButtonStyle.Danger);

const createRoomRow = new ActionRowBuilder()
    .addComponents(startBtn, removeBtn, joinBtn, leaveBtn);

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName == "가입하기") {
        await interaction.deferReply({ ephemeral: true });
        if (await joinCheck(interaction.user.id)) {
            await interaction.editReply("이미 가입하셨습니다.");
            return;
        }
        await user.run('INSERT INTO user(id) VALUES(?)', [interaction.user.id]);
        await interaction.editReply("가입되었습니다.");
        return;
    }

    if (interaction.isChatInputCommand()) { // 명령어를 입력했을 때 가입되어있지 않으면 바로 컷
        if (!await joinCheck(interaction.user.id)) {
            await interaction.reply({ content: "먼저 가입을 해주세요.", ephemeral: true });
            return;
        }
    }

    if (interaction.commandName == "내정보") {
        await interaction.deferReply();
        let userInfo = await getUserInfo(interaction.user.id);
        let userEmbad = new EmbedBuilder()
            .setTitle(`${interaction.user.globalName}님의 정보`)
            .setDescription(`점수: ${userInfo.score}점`)
            .setThumbnail(interaction.user.avatarURL());

        await interaction.editReply({ embeds: [userEmbad] });
        return;
    }

    if (interaction.commandName == "방생성") {
        await interaction.deferReply();
        let game = interaction.options.getString('게임');
        let gameInfo = await getGameInfo(game);
        let userListArr = [interaction.user.id];
        let userListTxt = '';
        let thread;


        let response = await interaction.editReply({ content: `${interaction.user.globalName}님이 ${gameInfo.gameName}방을 생성했어요! (${userListArr.length} / ${gameInfo.max})\n${interaction.user}(방장) /`, components: [createRoomRow] })
        const collector = response.createMessageComponentCollector({ time: 180_000 }); // 메세지에 대한 콜렉터 선언(버튼 입력 감지) 유지 시간 180초

        collector.on('end', async (collected, reason) => { // 콜렉터의 시간이 끝나면 실행
            if (reason == 'time') {
                await interaction.editReply({ content: '시간이 초과되어 방 생성이 취소되었습니다.', components: [] });
            }
        });

        collector.on('collect', async i => { // 콜렉터의 버튼 입력 감지 시 함수 실행
            userListTxt = '';
            if (!await joinCheck(i.user.id)) { // 버튼을 눌렀지만 가입이 되어있지 않으면
                await i.reply({ content: `먼저 가입을 해주세요.`, ephemeral: true })
                return;
            }

            if (i.customId == "참가") {
                if (userListArr.indexOf(String(i.user.id)) == -1) { // 해당 유저가 참가자 배열에 들어있지 않으면
                    if (userListArr.length >= gameInfo.max) { // 참가자 배열의 길이가 해당 게임의 최고인원수보자 크거나 같으면
                        await i.reply({ content: `방이 다 찼습니다.`, ephemeral: true })
                    } else {
                        userListArr.push(i.user.id) // 해당 유저를 참가자 배열에 추가
                        await i.reply({ content: `<@${interaction.user.id}> 님의 ${gameInfo.gameName} 방에 참가했습니다!`, ephemeral: true })
                    }
                } else {
                    await i.reply({ content: '이미 참가중 입니다.', ephemeral: true })
                }
            }

            if (i.customId == "나가기") {
                if (i.user.id !== interaction.user.id) { // 버튼을 누른 유저가 방을 생성한 유저가 아니라면
                    if (userListArr.indexOf(String(i.user.id)) != -1) { // 해당 유저가 참가자 배열에 들어있지 않으면
                        userListArr = userListArr.filter(userId => userId !== i.user.id); // 해당유저를 찾아서 배열에서 제거
                        await i.reply({ content: `방에서 나갔습니다.`, ephemeral: true });
                    } else {
                        await i.reply({ content: `방에 참가하지 않았습니다.`, ephemeral: true });
                    }
                } else {
                    await i.reply({ content: '방장은 방을 나갈 수 없습니다.', ephemeral: true });
                }
            }

            userListArr.forEach(user => { // userListArr로 포이치를 실행, 저기에 있는 user는 userListArr[n]와 같음
                userListTxt += `<@${user}>`; // 현재 참가중인 유저 목록 추가
                if (user == interaction.user.id) userListTxt += '(방장)' // 해당 user가 방생성 명령어를 실행 한 유저와 같으면 "(방장)" 추가
                userListTxt += ` / `
            });
            await interaction.editReply({ content: `${interaction.user.globalName}님이 ${gameInfo.gameName}방을 생성했어요! (${userListArr.length} / ${gameInfo.max})\n${userListTxt}`, components: [createRoomRow] })

            if (i.customId == "취소") {
                if (i.user.id == interaction.user.id) { // 버튼을 클릭한 유저가 방생성 명령어를 실행한 유저일 때
                    await i.reply({ content: `${gameInfo.gameName}방을 취소하셨습니다.`, ephemeral: true })
                    await interaction.editReply({ content: `방 생성이 취소되었습니다.`, components: [] })
                    collector.stop();
                } else {
                    await i.reply({ content: `방장 전용 기능입니다.`, ephemeral: true })
                }
            }

            if (i.customId == "게임시작") {
                if (i.user.id != interaction.user.id) {
                    await i.reply({ content: `방장 전용 기능입니다.`, ephemeral: true })
                } else {
                    if (userListArr.length < gameInfo.min) { // 현재 참가자가 해당 게임의 최소인원보다 적으면
                        await i.reply({ content: `해당 게임의 최소인원은 ${gameInfo.min}명 이상 입니다.`, ephemeral: true })
                    } else {
                        collector.stop();
                        thread = await interaction.channel.threads.create({ // 스레드 생성
                            name: `${game} 게임방 ${interaction.user.id}`, // 스레드 이름
                            autoArchiveDuration: 60, // 스레드 유지 시간(분)
                            type: ChannelType.PrivateThread, // 스레드 타입: 비공개
                        })

                        await thread.send(`# ${gameInfo.gameName}\n${gameInfo.rule}`);

                        userListArr.forEach(async user => { // 포이치로 참가자 배열만큼 반복 
                            await thread.members.add(user) // 참가자를 스레드에 초대
                        })

                        await eval(`${gameInfo.gameName}(thread, gameInfo, userListArr)`); // eval로 해당 게임와 같은 이름을 가진 함수 실행
                        await interaction.editReply({ content: `<@${interaction.user.id}>님의 ${gameInfo.gameName} 참가자 모집이 종료되었습니다.`, components: [] });
                    }
                }
            }
        })
    }
});

async function 반응속도(thread, gameInfo, userListArr) {
    let failUserArr = []; // 탈락유저
    let clickOrderArr = []; //활성화 버튼 클릭 유저

    const unactiveRow = new ActionRowBuilder()
        .addComponents(new ButtonBuilder()
            .setCustomId('unactive')
            .setLabel('기다리세요...')
            .setStyle(ButtonStyle.Secondary))

    const activeRow = new ActionRowBuilder()
        .addComponents(new ButtonBuilder()
            .setCustomId('active')
            .setLabel('누르세요!!')
            .setStyle(ButtonStyle.Danger))

    await thread.send('## 5초 후 게임이 시작됩니다.')
    let activeTiming = Math.floor(Math.random() * 10000) + 1000 // 1000 ~ 10000
    setTimeout(async i => {// 5초 후 게임시작
        const response = await thread.send({ components: [unactiveRow] })

        const collector = response.createMessageComponentCollector({ time: 60_000 });

        collector.on('collect', async i => {

            if (failUserArr.indexOf(i.user.id) != -1) { // 탈락자 배열에 있으면
                i.reply({ content: '탈락하셔서 더 이상 버튼을 누를 수 없습니다.', ephemeral: true })
                return;
            }

            if (i.customId == 'unactive') { // 누른 버튼이 비활성화 상태라면
                failUserArr.push(i.user.id) // 탈락자 배열에 추가
                i.reply({ content: '활성화 되지 않은 상태에서 버튼을 눌러서 탈락하셨습니다.', ephemeral: true })
            }

            if (failUserArr.length == userListArr.length) { // 탈락자와 참가자 목록의 길이가 같으면
                collector.stop();
                clearTimeout(clickTiming); // 이후 버튼 활성화 해주는 clickTiming 
                thread.messages.fetch(response.id).then(message => message.edit({ content: '모든 유저가 탈락하여 무승부로 게임을 종료합니다.', components: [] }));
                deleteThread(thread)
                return;
            }

            if (i.customId == 'active') { // 누른 버튼이 활성화 상태라면
                clickOrderArr.push(i.user.id); // 버튼 클릭 배열에 추가
                i.reply({ content: '버튼을 누르셨습니다!', ephemeral: true })
            }
        });

        const clickTiming = setTimeout(async j => {
            thread.messages.fetch(response.id).then(message => message.edit({ components: [activeRow] }));
            setTimeout(async () => { // 버튼 활성화 5초 이후 종료
                collector.stop();
                await thread.messages.fetch(response.id).then(message => message.edit({ content: '종료되었습니다!', components: [] }));
                if (clickOrderArr.length > 0) { // 클릭 리스트에 1명 이상이 있으면 승자보고서 함수 호출
                    winnerReport(thread, gameInfo, clickOrderArr[0], userListArr) // clickOrderArr[0]는 처음 버튼을 누른 사람
                } else {
                    await thread.send('승자가 없기 때문에 무승부로 게임을 종료합니다.');
                    deleteThread(thread)
                }
            }, 5000);
        }, 2000)
    }, 5000)
}

async function winnerReport(thread, gameInfo, winner, userListArr) {
    userListArr.forEach(async user => { // 포이치를 돌려서 userLIstArr만큼 반복
        if (user == winner) { // user가 winner와 같으면 점수 + 아니면 -
            await runQuery('UPDATE user SET score = score + ? WHERE id = ?', [gameInfo.plus, user]);
        } else {
            await runQuery('UPDATE user SET score = score - ? WHERE id = ?', [gameInfo.minus, user]);
        }
    });
    await thread.send(`<@${winner}>님이 승리하셨습니다!\n\n*<@${winner}> +${gameInfo.plus}점\n그 외 -${gameInfo.minus}점*`);
    deleteThread(thread)
}

async function deleteThread(thread) {
    thread.send('잠시 후 스레드가 제거됩니다.')
    setTimeout(async () => { // 5초 후 스레드 삭제
        await thread.delete();
    }, 5000);
}

async function runQuery(query, params) {
    return new Promise((resolve, reject) => {
        user.run(query, params, function (err) {
            if (err) {
                reject(err);
            } else {
                resolve(this);
            }
        });
    });
}

async function joinCheck(id) {
    return new Promise((resolve, reject) => {
        user.get("SELECT * FROM user WHERE id = ?", [id], (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(!!row);
            }
        });
    });
};

async function getUserInfo(id) {
    return new Promise((resolve, reject) => {
        user.get("SELECT * FROM user WHERE id = ?", [id], (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
}

async function getGameInfo(name) {
    return new Promise((resolve, reject) => {
        data.get("SELECT * FROM game WHERE gameName = ?", [name], (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
}

client.login(TOKEN);