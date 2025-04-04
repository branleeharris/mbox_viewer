// File: pages/_document.js
import Document, { Html, Head, Main, NextScript } from 'next/document'

class MyDocument extends Document {
  render() {
    return (
      <Html lang="en">
        <Head>
          {/* Add any additional meta tags or external resources here */}
          <link 
            href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" 
            rel="stylesheet"
          />
        </Head>
        <body>
          <Main />
          <NextScript />
          <noscript>
            <div style={{
              padding: '20px',
              textAlign: 'center',
              fontFamily: 'sans-serif',
              background: '#f8d7da',
              color: '#721c24',
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              zIndex: 9999
            }}>
              This application requires JavaScript to be enabled to function properly.
            </div>
          </noscript>
          <div id="portal-root"></div>
        </body>
      </Html>
    )
  }
}

export default MyDocument