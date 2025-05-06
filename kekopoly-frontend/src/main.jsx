import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ChakraProvider, extendTheme } from '@chakra-ui/react'
import { Provider } from 'react-redux'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { store } from './store/store'
import './index.css'
import './styles/doubles-animation.css' // Import the doubles animation CSS
import App from './App.jsx'
import BoardMapper from './devtools/BoardMapper'

// Create a custom theme for Kekopoly
const theme = extendTheme({
  colors: {
    brand: {
      50: '#f6f2e4',
      100: '#e6ddc4',
      200: '#d5c8a3',
      300: '#c4b282',
      400: '#b39d61',
      500: '#9a8446',
      600: '#786636',
      700: '#564826',
      800: '#342b16',
      900: '#120e05',
    },
    kekGreen: {
      500: '#5cb030',
    },
    kekRed: {
      500: '#c25a3a',
    },
    kekBlue: {
      500: '#3a90c2',
    },
  },
  fonts: {
    heading: 'system-ui, -apple-system, sans-serif',
    body: 'system-ui, -apple-system, sans-serif',
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Provider store={store}>
      <ChakraProvider theme={theme}>
        <BrowserRouter>
          <Routes>
            <Route path="/*" element={<App />} />
            <Route path="/dev/board-mapper" element={<BoardMapper />} />
          </Routes>
        </BrowserRouter>
      </ChakraProvider>
    </Provider>
  </StrictMode>,
)

// For development, add debugging for WebSocket errors
if (import.meta.env.DEV) {
  window.addEventListener('error', (event) => {
    if (event.target instanceof WebSocket) {
      console.error('WebSocket Error:', event);
    }
  });
}
