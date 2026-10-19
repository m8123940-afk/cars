from aiogram import Router
from aiogram.filters import CommandStart
from aiogram.types import (
    Message,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    WebAppInfo,
)

router = Router()

# Replace this with the real HTTPS URL of your Turbo Rivals game.
GAME_URL = "https://YOUR-GAME-URL"


@router.message(CommandStart())
async def start_command(message: Message):
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🚀 НАЧАТЬ ИГРУ",
                    web_app=WebAppInfo(url=GAME_URL),
                )
            ]
        ]
    )

    text = (
        "🏎️ <b>TURBO RIVALS</b>\n\n"
        "<b>ТВОЯ СКОРОСТЬ. ТВОИ ПРАВИЛА.</b>\n\n"
        "Город не спит. Двигатели ревут. Соперники уже на старте.\n\n"
        "Исследуй открытый мир, собирай коллекцию автомобилей, "
        "побеждай боссов и докажи, что именно ты достоин стать "
        "легендой гонок.\n\n"
        "<b>Ты готов оставить всех позади?</b>"
    )

    await message.answer(
        text=text,
        reply_markup=keyboard,
        parse_mode="HTML",
    )
