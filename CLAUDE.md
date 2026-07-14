# Project Outline

This project is currently in the planning phase.
The contents of this project is outlined in PROJECT.md, which is where you should source your information with which we can plan the implementation of the project.

## Implementation Details

This project is meant to be implemented as a monorepo, encompasing the full stack of the application.
Your guiding principle during design is to ensure that the following technical design decisions are considered when implementing the project design.

### The Stack

1. The frontend stack of the application should be a Vue.js application utilizing the latest version of Vuetify for general UI/UX design.
   1. In addition to this overall stack, I would like you to consider using a solution like TanQuery for caching and api calls.
2. The backend stack of the application should be a Node.js application utilizing the latest version of Express.js for general API design.
3. The database stack of the application can be recommended at your discretion, preferably something that is either cloud-hosted with minimal cost. This decision is deferred until the project's true data needs are better understood — do not commit to a specific database yet.
4. The file storage stack for user-submitted PDFs (bills, judgments) should be Cloudflare R2 (S3-compatible). PDFs must be served from a separate origin from the application itself, with appropriate `Content-Disposition` and CSP sandbox headers, to prevent malicious uploads from becoming an XSS vector.
5. The authentication stack of the application should utilize the standard OAuth2.0 specifications for ROBLOX.
6. The deployment stack of the application should utilize Docker for containerization, and should be deployable to a cloud provider or a local machine.

### Principals

1. You should make your best effort to maintain functionality for both a local instance and a deployed instance for easy testing. You should keep a README.md file up to date with instructions on how to run the application locally and how to deploy it to a cloud provider.
2. You should have a plan on how to securely store and access secrets without reading them directly.
3. Though the code within this repository is mainly managed by agents, it should still have the end goal of being readable for maintainers. As such, you should strive to write code that is easy to understand and maintain. You should also utilize a a properly configured linting package for consistency.
4.
