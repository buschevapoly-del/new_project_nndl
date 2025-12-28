const ydb = require('ydb');

// Инициализация драйвера YDB
let driver;

async function initDriver() {
    if (!driver) {
        driver = new ydb.Driver({
            endpoint: process.env.ENDPOINT,
            database: process.env.DATABASE,
            credentials: ydb.iam.MetadataUrlCredentials(),
        });
        await driver.ready();
    }
}

// Создание таблицы notes при первом запуске
async function createTable() {
    const session = await driver.createSession();
    try {
        await session.execute({
            text: `
                CREATE TABLE IF NOT EXISTS notes (
                    id Utf8,
                    text Utf8,
                    timestamp Timestamp,
                    PRIMARY KEY (id)
                );
            `
        });
    } catch (err) {
        console.error("Ошибка при создании таблицы:", err);
    } finally {
        await session.close();
    }
}

// Сохранение заметки
async function saveNote(note) {
    const session = await driver.createSession();
    try {
        await session.execute({
            text: `
                UPSERT INTO notes (id, text, timestamp)
                VALUES ($id, $text, $timestamp);
            `,
            parameters: {
                '$id': ydb.PrimitiveTypeUtf8().createOptionalValue(note.id),
                '$text': ydb.PrimitiveTypeUtf8().createOptionalValue(note.text),
                '$timestamp': ydb.PrimitiveTypeTimestamp().createOptionalValue(new Date(note.timestamp))
            }
        });
    } finally {
        await session.close();
    }
}

// Получение всех заметок
async function listNotes() {
    const session = await driver.createSession();
    try {
        const result = await session.execute({
            text: `
                SELECT id, text, timestamp
                FROM notes
                ORDER BY timestamp DESC;
            `
        });
        const resultSet = result.resultSets[0];
        const notes = [];
        for (const row of resultSet.rows) {
            notes.push({
                id: row.id,
                text: row.text,
                timestamp: row.timestamp.toISOString()
            });
        }
        return notes;
    } finally {
        await session.close();
    }
}

// Простой ИИ-анализ: группировка по ключевым словам
function analyzeNotes(notes, query = "") {
    const lowerQuery = query.toLowerCase();
    const summary = {
        total: notes.length,
        byWeek: {},
        themes: {}
    };

    // Группировка по неделям
    notes.forEach(note => {
        const week = new Date(note.timestamp).toLocaleDateString('ru-RU', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        summary.byWeek[week] = (summary.byWeek[week] || 0) + 1;
    });

    // Поиск тем по ключевым словам
    const keywords = {
        "работа": ["работа", "проект", "задача", "встреча", "отчёт"],
        "здоровье": ["здоровье", "спорт", "еда", "сон", "упражнения"],
        "семья": ["семья", "дом", "дети", "родители"],
        "финансы": ["деньги", "бюджет", "расходы", "доход", "счёт"]
    };

    Object.keys(keywords).forEach(theme => {
        summary.themes[theme] = 0;
        keywords[theme].forEach(word => {
            notes.forEach(note => {
                if (note.text.toLowerCase().includes(word)) {
                    summary.themes[theme]++;
                }
            });
        });
    });

    // Фильтрация по запросу
    if (lowerQuery.includes("работа")) {
        return `Вы писали о работе ${summary.themes["работа"]} раз(а).`;
    }
    if (lowerQuery.includes("здоровье")) {
        return `Вы писали о здоровье ${summary.themes["здоровье"]} раз(а).`;
    }
    if (lowerQuery.includes("семья")) {
        return `Вы писали о семье ${summary.themes["семья"]} раз(а).`;
    }
    if (lowerQuery.includes("финансы")) {
        return `Вы писали о финансах ${summary.themes["финансы"]} раз(а).`;
    }
    if (lowerQuery.includes("недел")) {
        const lastWeek = Object.keys(summary.byWeek).slice(0, 7).join(", ");
        return `За последнюю неделю: ${lastWeek}. Всего заметок: ${summary.total}.`;
    }

    return `Всего заметок: ${summary.total}. Темы: работа — ${summary.themes["работа"]}, здоровье — ${summary.themes["здоровье"]}, семья — ${summary.themes["семья"]}, финансы — ${summary.themes["финансы"]}.`;
}

// Основной обработчик
module.exports.handler = async (event, context) => {
    try {
        await initDriver();
        await createTable();

        const body = event.body ? JSON.parse(event.body) : {};
        const action = event.queryStringParameters?.action || body.action;

        if (action === "save") {
            await saveNote(body.note);
            return {
                statusCode: 200,
                body: JSON.stringify({ success: true })
            };
        }

        if (action === "list") {
            const notes = await listNotes();
            return {
                statusCode: 200,
                body: JSON.stringify(notes)
            };
        }

        if (action === "analyze") {
            const notes = await listNotes();
            const result = analyzeNotes(notes, body.query);
            return {
                statusCode: 200,
                body: JSON.stringify({ result })
            };
        }

        return {
            statusCode: 400,
            body: JSON.stringify({ error: "Неизвестное действие" })
        };
    } catch (err) {
        console.error(err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: err.message })
        };
    }
};
