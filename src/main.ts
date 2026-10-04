import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

// iOS Safari pinch-zooms the page despite user-scalable=no; the canvas does its own pinch.
document.addEventListener('gesturestart', (ev) => ev.preventDefault())

createApp(App).mount('#app')
