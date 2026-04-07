Архитектурен подход — модулност
Copilot трябва да следва тези правила:
- Разделяй кода на отделни модули:
- telephony-service
- conversation-engine
- calendar-service
- crm-service
- nlp-intent-service
- data-standardization
- logging-service
- Всеки модул трябва да има:
- собствена директория
- собствена логика
- собствен API интерфейс
- ясни входове и изходи
Цел: Лесно разширяване, поддръжка и повторна употреба.

2. Микросервизен модел
Copilot трябва да генерира код, който:
- Използва REST API между модулите
- Използва отделни процеси/контейнери (Docker-ready)
- Използва environment variables за конфигурация
- Позволява независимо обновяване на всеки модул
Принципи:
- Никаква бизнес логика в gateway слоя
- Всеки модул е самостоятелен
- Общи модели се държат в shared библиотека

3. Инкрементален подход (step-by-step development)
Copilot трябва да:
- Изгражда първо базовите функции
- Добавя сложност само след като базовата версия работи
- Използва feature flags за нови функции
- Генерира TODO маркери за бъдещи разширения
Етапи:
- Телефония → ASR → TTS
- Диалогов мениджър
- Google Calendar
- CRM
- Алтернативи и препоръки
- ML/AI подобрения

4. Валидация на потребителските нужди
Copilot трябва да:
- Включва hooks за логване на потребителски действия
- Генерира функции за събиране на обратна връзка
- Подготвя тестови сценарии за етапи 6 и 13
- Поддържа debug режим за анализ на разговори

5. Стандартизация на данните
Copilot трябва да използва единен формат за всички модули:
Стандартен формат за клиентски данни
{
  "client_id": "",
  "name": "",
  "phone": "",
  "budget": 0,
  "location": "",
  "property_type": "",
  "move_in_date": "",
  "viewing_date": "",
  "notes": "",
  "status": ""
}


Стандартен формат за разговорна сесия
{
  "session_id": "",
  "step": "",
  "intent": "",
  "entities": {},
  "missing_fields": [],
  "timestamp": ""
}


Copilot трябва да гарантира, че всички модули използват тези структури.

6. Интеграция с AI/ML
Copilot трябва да:
- Подготви архитектура за бъдещ ML модул:
- intent classification
- entity extraction
- sentiment analysis
- Използва LLM само като първи слой
- Остави hooks за ML модел, който може да бъде обучен по-късно
Пример:
- nlp-intent-service трябва да има интерфейс:
- classifyIntent(text)
- extractEntities(text)

7. Планиране на следващи етапи
Copilot трябва да:
- Добавя коментари за бъдещи функции
- Генерира roadmap.md файл
- Подготвя структура за:
- recommendation engine
- multi-agent workflows
- multi-language support

8. Оптимизация на тестовото управление
Copilot трябва да:
- Генерира автоматизирани тестове:
- unit tests
- integration tests
- API tests
- Използва Jest (Node.js) или PyTest (Python)
- Създава mock услуги за:
- Google Calendar
- CRM
- Telephony
Цел: стабилен MVP, лесно разширяване.

🧩 Формат за подаване към Copilot (готов за копиране)
You are a development assistant responsible for implementing a modular, microservice-based architecture for a real estate voice assistant MVP. Follow these rules:

1. Use modular architecture with separate services:
   - telephony-service
   - conversation-engine
   - calendar-service
   - crm-service
   - nlp-intent-service
   - data-standardization
   - logging-service

2. Use microservices with REST APIs, environment variables, and Docker-ready structure.

3. Build incrementally:
   - Start with telephony → ASR → TTS
   - Then conversation engine
   - Then Google Calendar
   - Then CRM
   - Then alternative suggestions
   - Then ML/AI improvements

4. Use standardized data formats for all modules (client data, session data).

5. Include hooks for user feedback and logging.

6. Prepare architecture for future ML integration (intent classification, entity extraction).

7. Add TODO markers and roadmap suggestions for future features.

8. Generate automated tests (unit, integration, API) and mocks for external services.

Always generate clean, modular, production-ready code following these principles.



🎯 Готов си да започнеш разработката
Тези инструкции ще направят Copilot много по-структуриран, ще го насочат към архитектура, а не хаотичен код, и ще ти позволят да изграждаш MVP-то като истински продукт.
Ако искаш, мога да ти подготвя и:
- файлова структура за целия проект
- Docker архитектура
- API спецификация за всеки модул
- примерни endpoints
- примерни unit tests

Минималните доставчици, които трябва да платиш
- Използва се за приемане и изпращане на телефонни обаждания
Speech‑to‑Text (ASR) – Whisper API (OpenAI)
- Цена: около 10–30 лв на месец
- Използва се за превръщане на реч в текст (български език)
Text‑to‑Speech (TTS) – ElevenLabs
- Цена: около 10–30 лв на месец
- Използва се за генериране на естествен български глас
LLM (диалогов мениджър) – OpenAI GPT‑4o или GPT‑4.1
- Цена: около 20–80 лв на месец
- Използва се за разбиране на намерението и управление на разговора
Календар – Google Calendar API
- Цена: безплатно
- Използва се за насрочване на огледи
Хостинг – Hetzner или DigitalOcean VPS
- Цена: около 10–20 лв на месец
- Използва се за backend сървъра на MVP‑то
CRM (MVP вариант) – Google Sheets API
- Цена: безплатно
- Използва се за съхранение на клиентски данни

Общо: 70–180 лв/месец за работещ MVP
