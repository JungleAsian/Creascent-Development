'use client'

// Panel language toggle (Gap #15). Two-button ES/EN switch wired to useI18n,
// which persists the choice via POST /user/preferences when authenticated.
import { useI18n } from '../hooks/useI18n'
import { LANGUAGES } from '../i18n'

export function LanguageToggle() {
  const { language, changeLanguage } = useI18n()
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-gray-300 text-xs dark:border-gray-700">
      {LANGUAGES.map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => changeLanguage(lang)}
          aria-pressed={language === lang}
          className={
            language === lang
              ? 'bg-indigo-600 px-2.5 py-1 font-semibold uppercase text-white'
              : 'px-2.5 py-1 uppercase text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
          }
        >
          {lang}
        </button>
      ))}
    </div>
  )
}
