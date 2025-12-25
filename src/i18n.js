const translations = {
    en: {
        dialogs: {
            criticalError: {
                title: 'Critical Error',
                message: 'A critical, unrecoverable error occurred. The application will now close.\n\nError details:\n'
            },
            networkError: {
                title: 'Network Error',
                message: 'No internet connection or DNS lookup failed. Please check your network settings.'
            },
            noNodes: {
                title: 'No Nodes Found',
                message: 'No active Flux nodes were found. Please check the following:\n1. The IP addresses in settings.ini are correct.\n2. Your internet connection is stable.\n3. A firewall or antivirus is not blocking the application\'s outgoing connections.',
                buttons: ['Open Settings', 'Open Docs', 'Exit']
            },
            about: {
                title: 'About Flux Node Manager',
                description: 'Professional monitoring and management tool for Flux Nodes.\nDeveloped by SfilD Labs with Gemini AI assistance.',
                buttons: ['OK', 'View License']
            }
        }
    },
    ru: {
        dialogs: {
            criticalError: {
                title: 'Критическая ошибка',
                message: 'Произошла критическая, неустранимая ошибка. Приложение будет закрыто.\n\nДетали ошибки:\n'
            },
            networkError: {
                title: 'Ошибка сети',
                message: 'Отсутствует подключение к интернету или ошибка DNS. Пожалуйста, проверьте настройки сети.'
            },
            noNodes: {
                title: 'Узлы не найдены',
                message: 'Активные узлы Flux не найдены. Пожалуйста, проверьте следующее:\n1. IP-адреса в файле settings.ini указаны верно.\n2. Ваше интернет-соединение стабильно.\n3. Брандмауэр или антивирус не блокируют исходящие соединения приложения.',
                buttons: ['Открыть настройки', 'Открыть инструкцию', 'Выход']
            },
            about: {
                title: 'О программе Flux Node Manager',
                description: 'Профессиональный инструмент мониторинга и управления для узлов Flux.\nРазработано SfilD Labs при поддержке Gemini AI.',
                buttons: ['OK', 'Лицензия']
            }
        }
    }
};

/**
 * Returns the translation object for the specified locale.
 * Defaults to 'en' if the locale is not 'ru'.
 * @param {string} locale The locale string (e.g., 'en-US', 'ru-RU').
 * @returns {object} The translation object.
 */
function getStrings(locale) {
    const lang = (locale && locale.toLowerCase().startsWith('ru')) ? 'ru' : 'en';
    return translations[lang];
}

module.exports = { getStrings };
