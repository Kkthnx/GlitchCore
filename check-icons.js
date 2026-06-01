const icons = [
    'achievement_boss_c_thun', 'achievement_dungeon_azjolnerub', 'ui_warbands_icon',
    'inv_misc_book_11', 'inv_tradingpost_chest', 'ability_dragonriding_vigor01',
    'ability_skyriding', 'icon_world_quest', 'inv_misc_map_01', 'inv_misc_bag_10',
    'trade_herbalism', 'achievement_dungeon_heroic_gloryoftheraider'
];

async function checkIcons() {
    for (const icon of icons) {
        const url = `https://wow.zamimg.com/images/wow/icons/large/${icon}.jpg`;
        try {
            const res = await fetch(url, { method: 'HEAD' });
            console.log(`${icon}: ${res.status}`);
        } catch (e) {
            console.log(`${icon}: ERROR`);
        }
    }
}
checkIcons();
