const express = require('express');
const {Telegraf, Markup} = require('telegraf');
const axios = require("axios");
const jsdom = require("jsdom");
const fuzzysort = require('fuzzysort')
const {JSDOM} = jsdom;

const API = {
    GV: 'https://cabinet.cherkasyoblenergo.com/gv.php',
    CITIES: 'https://cabinet.cherkasyoblenergo.com/ajax/searcityg.php',
    STREETS: 'https://cabinet.cherkasyoblenergo.com/ajax/searstrg.php',
    HOUSES: 'https://cabinet.cherkasyoblenergo.com/ajax/searhouseg.php',
    FLATS: 'https://cabinet.cherkasyoblenergo.com/ajax/searflatg.php',
    ADDRESS: 'https://cabinet.cherkasyoblenergo.com/ajax/searadrrez.php',
}

const GLOBAL_ENTITIES = {
    REM: [], CITIES: [], STREETS: [], HOUSES: [], FLATS: [],
}

const METADATA = {
    REM: null, CITY: null, STREET: null, HOUSE: null,
}

let STEP = 0;

const getOptions = async (html, id) => {
    const dom = new JSDOM(html);

    const ENTITIES = [];
    const OPTIONS = await dom.window.document.querySelector(id).querySelectorAll('option');

    for (let i = 0; i < OPTIONS.length; i++) {
        ENTITIES.push({
            label: OPTIONS[i].textContent, value: OPTIONS[i].getAttribute('value'),
        });
    }

    return ENTITIES || [];
};

const createKeyboard = (values, onlyValues = false) => {
    const BUTTONS = values.reduce((acc, cur) => {
        acc.push(onlyValues ? cur.value : `${cur.value} - ${cur.label}`);
        return acc;
    }, []);

    const CHUNK_SIZE = 3;
    const BUTTONS_CHUNKS = [];
    for (let i = 0; i < BUTTONS.length; i += CHUNK_SIZE) {
        const chunk = BUTTONS.slice(i, i + CHUNK_SIZE);
        BUTTONS_CHUNKS.push(chunk);
    }

    return Markup.keyboard(BUTTONS_CHUNKS).resize();

}

const bot = new Telegraf('[token]');

const init = async (ctx, isHome = false) => {
    if (isHome) {
        const formData = new URLSearchParams({street: 208, house: '1/2', flat: 150, type_ab: 0});
        const response = await axios.post(API.ADDRESS, formData);
        const dom = new JSDOM(response.data);
        const labels = dom.window.document.querySelectorAll('label');
        const result = [];

        for (let i = 0; i < labels.length; i++) {
            result.push(labels[i].textContent);
        }

        if (result.length) {
            result.forEach((text) => {
                ctx.reply(text);
            });
        } else {
            ctx.reply('Нічого не нашло');
        }
    } else {
        const response = await axios.get(API.GV);
        const REM_VALUES = await getOptions(response.data, '#rem');

        GLOBAL_ENTITIES.REM = REM_VALUES;
        const BUTTONS_MARKUP = createKeyboard(REM_VALUES);

        STEP = 1;
        return await ctx.reply("Custom buttons keyboard", BUTTONS_MARKUP);
    }
}

bot.start(async (ctx) => {
    return await init(ctx);
});

bot.command("home", async ctx => {
    await init(ctx, true);
});

bot.command('new', async (ctx) => {
    await init(ctx, false);
})

// const createButton = (option) => `${option.value} - ${option.label}`;

bot.hears(/\d [-] .*/, async (ctx) => {
    const VALUE = ctx.message.text.split('-')[0].trimEnd();

    if (STEP === 1) {
        METADATA.REM = VALUE;
        const response = await axios.get(API.CITIES, {params: {rem: VALUE}});
        const CITIES_VALUES = await getOptions(response.data, '#scity');
        const KEYBOARD = createKeyboard(CITIES_VALUES);
        STEP = 2;
        return await ctx.reply('Choose City', KEYBOARD.oneTime());
    } else if (STEP === 2) {
        METADATA.CITY = VALUE;
        const response = await axios.get(API.STREETS, {params: {rem: METADATA.REM}});
        GLOBAL_ENTITIES.STREETS = await getOptions(response.data, '#sstr');
        STEP = 3;
        return await ctx.reply('Write Your Street');
    } else if (STEP === 3) {
        METADATA.STREET = VALUE;
        const formData = new URLSearchParams({rem: VALUE});
        const response = await axios.post(API.HOUSES, formData);
        const HOUSES_VALUES = await getOptions(response.data, '#shouse', true);
        // console.log(STREETS_VALUES);
        const KEYBOARD = createKeyboard(HOUSES_VALUES, true).oneTime();
        STEP = 4;
        return await ctx.reply('Choose House', KEYBOARD);
    } else if (STEP === 4) {

        // console.log(STREETS_VALUES);
        // const KEYBOARD = createKeyboard(HOUSES_VALUES, true);
        // STEP = 4;
        // return await ctx.reply('Choose House', KEYBOARD);
    }

});

bot.on('text', async (ctx) => {
    const text = ctx.update.message.text;

    if (STEP === 3) {
        const res = fuzzysort.go(text, GLOBAL_ENTITIES.STREETS, {key: 'label', limit: 20});
        if (!!res.length) {
            const preMap = (item) => item.obj;
            const options = res.map(preMap);

            const KEYBOARD = createKeyboard(options).oneTime();
            return await ctx.reply('Choose Street', KEYBOARD);
        }
    } else if (4) {
        METADATA.HOUSE = text;
        const formData = new URLSearchParams({street: METADATA.STREET, house: text, flat: 1, type_ab: 0});
        const response = await axios.post(API.ADDRESS, formData);
        const dom = new JSDOM(response.data);
        const labels = dom.window.document.querySelectorAll('label');
        const result = [];

        for (let i = 0; i < labels.length; i++) {
            result.push(labels[i].textContent);
        }

        if (result.length) {
            result.forEach((text) => {
                ctx.reply(text);
            });
        } else {
            ctx.reply('Нічого не нашло');
        }
    }
});

bot.launch();