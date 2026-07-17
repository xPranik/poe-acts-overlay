import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { SettingsApp } from './settings/SettingsApp'
import './styles.css'

// одно renderer-приложение на два окна: оверлей (по умолчанию) и настройки (#settings)
const Root = window.location.hash.startsWith('#settings') ? SettingsApp : App

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
