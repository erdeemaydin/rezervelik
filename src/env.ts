// Load .env before anything else does. This must be the very first import in
// server.ts — see the comment there for why: TypeScript's CommonJS output
// runs `import` side effects in file order, so any module imported before
// dotenv.config() would read process.env before it's populated.
import dotenv from 'dotenv';
dotenv.config();
