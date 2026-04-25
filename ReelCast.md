ReelCast: Automated Multi-Platform Commercial Content Generation System
=======================================================================

📖 Overview
-----------

ReelCast is an all-in-one, automated web application designed to empower online merchants, affiliate marketers, and brand owners to effortlessly create, manage, and distribute premium short-form video content (Reels). By acting as a centralized hub, ReelCast bridges the gap between content creation and e-commerce. It leverages advanced Generative AI to reduce video production time from hours to minutes while maintaining high commercial quality.

⚠️ The Core Problem
-------------------

Currently, digital marketers and creators face significant workflow bottlenecks:

-   **High-Barrier Production:** Creating high-quality commercial videos requires advanced editing skills and hours of manual labor.

-   **Fragmented Tools (The "Silo" Effect):** Creators are forced to juggle multiple disjointed applications to generate video, schedule posts, and manage affiliate links.

-   **Complex Link Management:** Embedding and tracking affiliate links across different platforms is a repetitive, error-prone manual task that is further complicated by strict API limitations.

✨ Key Features
--------------
-  **Register and Login:** 

-   **AI-Powered Reel Generation:** Utilizes Google Veo to generate marketing-focused background videos (B-roll) and Google Gemini to automatically craft platform-specific captions and hashtags.

-   **Comprehensive Product Library:** Allows users to manage inventory, categorize products into campaigns, embed smart affiliate links, and track promotional performance.

-   **Preview & Approval Workflow:** Ensures users maintain full creative control by allowing them to review AI-generated B-roll, edit captions, adjust product image overlays, and regenerate media before publishing.

-   **Multi-Platform Distribution:** Seamlessly publishes and schedules finalized media directly to target social networks, including YouTube Shorts, Facebook, Instagram, and TikTok.

-   **Data Tracking & Analytics:** Connects with major e-commerce platforms (TikTok Shop, Shopee, Lazada) and social media channels to synchronize tracking data for views, clicks, and orders.

🛠️ Technology Stack
--------------------

The system is built on a robust, highly scalable architecture:

-   **Frontend:** Next.js (a React framework) for a fast, responsive, and optimized web interface.

-   **Backend:** Python and FastAPI to orchestrate the AI generation pipeline, manage APIs, and handle complex business logic.

-   **Generative AI Module:** Google Cloud Vertex AI, specifically featuring Google Veo 3 for video generation and Gemini for multimodal text/scripting tasks.

-   **Media Processing:** FFmpeg serves as the core engine for scaling, video editing, and overlaying actual product images and brand watermarks.

-   **Database & Storage:** PostgreSQL manages structured data (user accounts, campaign metadata), while Cloudflare R2 provides cost-effective, zero-egress object storage for large video files.

-   **Infrastructure:** The system is containerized using Docker and deployed on AWS EC2. Redis is utilized as an in-memory queue management system to handle heavy, asynchronous background tasks via a Worker Pool.

🔄 Development Methodology
--------------------------

The project strictly follows the **Iterative Model**, which involves developing the software in repeated cycles of design, implementation, and testing. This approach is crucial for early risk mitigation, especially when dealing with the unpredictability of cutting-edge Generative AI outputs and managing complex, strict third-party social media APIs.