# Groover Mode

Groover Mode é uma extensão para navegadores que ajuda músicos a praticar no YouTube usando contagem regressiva, mudança de tom e checkpoints salvos.

## Recursos

- Contagem regressiva para iniciar ou retomar a prática musical.
- Alteração de tom para ajustar a reprodução de acordo com suas necessidades.
- Checkpoints salvos para retomar onde parou.
- Interface leve com popup e integração com vídeos do YouTube.

## Tecnologias

- Vite
- React 19
- Tone.js
- Manifest V3 para extensões baseada em Chromium

## Estrutura do projeto

- `public/manifest.json` - Configuração da extensão
- `background.js` - Service worker do background
- `src/content.js` - Script injetado nas páginas do YouTube
- `src/popup/` - Interface de popup da extensão
- `vite.config.js` - Configuração do Vite

## Como usar

1. Instale as dependências:

```bash
npm install
```

2. Execute o modo de desenvolvimento:

```bash
npm run dev
```

3. Para gerar a versão final da extensão:

```bash
npm run build
```

## Instalar como extensão

1. Abra o navegador e acesse `chrome://extensions/` (ou `[seu-navegador]://extensions/`).
2. Ative o modo de desenvolvedor.
3. Clique em "Carregar sem compactação".
4. Selecione o build do projeto (`/groover-mode/dist`).

## Observações

- A extensão requer permissão para acessar páginas do YouTube.
- Os dados são armazenados localmente usando a API de `storage` do navegador.

## Licença

Projeto privado.
