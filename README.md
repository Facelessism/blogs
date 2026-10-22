# My Blogs

A small page to save my blogs

## Expected architecture

```
my-blog/
├── public/
│   ├── favicon.svg
│   └── images/
│
├── src/
│   ├── content/
│   │   └── blog/
│   │       └── understanding-web-architecture.mdx
│   │
│   ├── content.config.ts
│   │
│   ├── components/
│   │   ├── BlogCard.astro
│   │   ├── BlogSearch.astro
│   │   └── Pagination.astro
│   │
│   ├── layouts/
│   │   ├── BaseLayout.astro
│   │   └── ArticleLayout.astro
│   │
│   ├── pages/
│   │   ├── index.astro
│   │   ├── 404.astro
│   │   ├── blog/
│   │   │   ├── index.astro
│   │   │   ├── [...page].astro
│   │   │   ├── [...slug].astro
│   │   │   ├── category/
│   │   │   │   └── [category].astro
│   │   │   └── tag/
│   │   │       └── [tag].astro
│   │   └── admin/
│   │       └── index.astro
│   │
│   ├── lib/
│   │   ├── blog.ts
│   │   ├── word-count.ts
│   │   └── reading-time.ts
│   │
│   └── styles/
│       └── global.css
│
├── workers/
│   └── publishing-api/
│       ├── src/
│       │   ├── index.ts
│       │   └── github.ts
│       ├── wrangler.toml
│       └── package.json
│
├── scripts/
│   └── validate-content.ts
│
├── tests/
│   ├── word-count.test.ts
│   └── reading-time.test.ts
│
├── .github/
│   └── workflows/
│       ├── deploy.yml
│       └── validate.yml
│
├── .gitignore
├── .nvmrc
├── astro.config.mjs
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── README.md
└── LICENSE
```
