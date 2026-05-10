# ReelCast -- Software Requirements Specification

#

# F = Features

#

# SRS = Software Requirement Specification

#

# URS = User Requirement Specification

#

# \## F1: Registration \& Authentication System

#

# \### \*\*F1-URS01:\*\* Guests register an account to change their status to a Member

#

# \#### \*\*F1-URS01-SRS01:\*\* The system shall provide a registration form that collects the guest's username, email address, and password

#

# \#### \*\*F1-URS01-SRS02:\*\* The system shall validate that the email address follows a standard format (e.g., <user@domain.com>) before submission

#

# \#### \*\*F1-URS01-SRS03:\*\* The system shall enforce a minimum password length of 6 characters, requiring at least one uppercase letter, one number, and one special character

#

# \#### \*\*F1-URS01-SRS04:\*\* The system shall send an email verification link to the registered address upon successful form submission

#

# \#### \*\*F1-URS01-SRS05:\*\* The system shall automatically update the user's role from "Guest" to "Member" once the email is verified

#

# \### \*\*F1-URS02:\*\* Members log in and authenticate their identity to communicate with the backend

#

# \#### \*\*F1-URS02-SRS01:\*\* The system shall provide a login interface accepting email and password credentials

#

# \#### \*\*F1-URS02-SRS02:\*\* The system shall authenticate the member's credentials against the stored hashed password in the database

#

# \#### \*\*F1-URS02-SRS03:\*\* The system shall generate a JWT (JSON Web Token) or session token upon successful authentication, which is used for all subsequent backend API requests

#

# \#### \*\*F1-URS02-SRS04:\*\* The system shall provide a "Forgot Password" mechanism that sends a password reset link to the registered email

#

# \## F2: AI Video Generation \& Processing

#

# \### \*\*F2-URS01:\*\* Members input a text prompt and select a product from the Product Library

#

# \#### \*\*F2-URS01-SRS01:\*\* The system shall provide a text input field that allows members to enter a promotional or descriptive prompt (max 500 characters)

#

# \#### \*\*F2-URS01-SRS02:\*\* The system shall display a searchable Product Library listing all products linked to the member's campaigns

#

# \#### \*\*F2-URS01-SRS03:\*\* The system shall allow the member to select exactly one product from the Product Library per generation request

#

# \#### \*\*F2-URS01-SRS04:\*\* The system shall display the selected product's name, image thumbnail, and affiliated campaign when chosen

#

# \#### \*\*F2-URS01-SRS05:\*\* The system shall prevent form submission if either the text prompt or product selection is empty, displaying a validation error

#

# \### \*\*F2-URS02:\*\* Members generate Reels for product advertising automatically using Google Veo

#

# \#### \*\*F2-URS02-SRS01:\*\* The system shall send the member's text prompt and selected product metadata to the Google Veo API to generate a short-form video Reel

#

# \#### \*\*F2-URS02-SRS02:\*\* The system shall display a loading/progress indicator to the member while the Veo generation process is running

#

# \#### \*\*F2-URS02-SRS03:\*\* The generated Reel shall be in vertical format (9:16 aspect ratio) with a minimum resolution of 720p and a maximum time duration of 60 seconds

#

# \#### \*\*F2-URS02-SRS04:\*\* The system shall store the generated Reel temporarily in cloud storage and provide a secure preview URL to the member

#

# \#### \*\*F2-URS02-SRS05:\*\* The system shall handle API timeout or generation failures gracefully, notifying the member with a descriptive error message and an option to retry

#

# \### \*\*F2-URS03:\*\* Members generate optimized captions and hashtags tailored for target social media platforms autonomously using Gemini

#

# \#### \*\*F2-URS03-SRS01:\*\* The system shall send the member's text prompt, product details, and target platform to the Gemini API to generate a caption and hashtag set

#

# \#### \*\*F2-URS03-SRS02:\*\* The system shall generate platform-specific captions, distinguishing between Instagram-optimized and Facebook-optimized formats

#

# \#### \*\*F2-URS03-SRS03:\*\* The generated output shall include a main caption (max 1,600 characters for Instagram) and a list of relevant hashtags are maximum to 4

#

# \#### \*\*F2-URS03-SRS04:\*\* The system shall display the generated caption and hashtags in an editable text field so the member can make manual adjustments before publishing

#

# \### \*\*F2-URS04:\*\* Members upload their own Reels directly into the system for real-time processing

#

# \#### \*\*F2-URS04-SRS01:\*\* The system shall provide a file upload interface supporting video formats including MP4, MOV, and AVI, with a maximum file size of 500 MB and a maximum time duration of 60 seconds

#

# \#### \*\*F2-URS04-SRS02:\*\* The system shall validate the uploaded file's format and size before accepting it, displaying an error if the file does not meet the requirements

#

# \#### \*\*F2-URS04-SRS03:\*\* The system shall display an upload progress bar reflecting the real-time upload status

#

# \#### \*\*F2-URS04-SRS04:\*\* Upon successful upload, the system shall store the video in the backend processing queue and confirm receipt to the member

#

# \### \*\*F2-URS05:\*\* Members overlay actual product images and brand logos onto the AI-generated Reels using FFmpeg

#

# \#### \*\*F2-URS05-SRS01:\*\* The system shall use FFmpeg to composite the member's product image and/or brand logo onto the AI-generated or uploaded Reel

#

# \#### \*\*F2-URS05-SRS02:\*\* The system shall allow the member to specify the position (e.g., bottom-left, bottom-right, center) and scale of the overlay elements

#

# \#### \*\*F2-URS05-SRS03:\*\* The overlay process shall preserve the original video's resolution, aspect ratio, and frame rate

#

# \#### \*\*F2-URS05-SRS04:\*\* The system shall produce the final overlaid video as an MP4 file encoded with H.264 codec for broad compatibility

#

# \### \*\*F2-URS06:\*\* Members preview and approve the generated content before it is published to ensure full creative control

#

# \#### \*\*F2-URS06-SRS01:\*\* The system shall present the member with a preview page displaying the final Reel video, caption, and hashtags before any publishing action

#

# \#### \*\*F2-URS06-SRS02:\*\* The preview page shall include an inline video player with play, pause, and seek controls

#

# \#### \*\*F2-URS06-SRS03:\*\* The system shall provide an "Approve \& Publish" button and a "Reject \& Revise" button on the preview page

#

# \#### \*\*F2-URS06-SRS04:\*\* The system shall not publish or distribute any content without explicit member approval (clicking "Approve \& Publish")

#

# \### \*\*F2-URS07:\*\* Members regenerate the content if the initial AI outputs are unsatisfactory or unpredictable

#

# \#### \*\*F2-URS07-SRS01:\*\* The system shall provide a "Regenerate" option on the preview page for the Reel video, caption, and hashtags independently

#

# \#### \*\*F2-URS07-SRS02:\*\* The system shall allow the member to modify the original text prompt before triggering regeneration

#

# \#### \*\*F2-URS07-SRS03:\*\* The system shall retain the previously generated content until the new generation is complete, allowing the member to compare results

#

# \*\*F2-URS07-SRS04:\*\* The system shall discard superseded generations from temporary storage after the member approves a final version.

#

# \## F4: Product Library

#

# \### \*\*F4-URS01:\*\* Members create new campaigns to serve as the main structure for organizing product collections

#

# \#### \*\*F4-URS01-SRS01:\*\* The system shall provide a "Create Campaign" interface where the member enters a campaign name, description, and optional cover image

#

# \#### \*\*F4-URS01-SRS02:\*\* The system shall reject campaign creation when the campaign name is blank and shall store the campaign with the authenticated member's account

#

# \#### \*\*F4-URS01-SRS03:\*\* The system shall persist the new campaign record in the database, linked to the member's account ID

#

# \#### \*\*F4-URS01-SRS04:\*\* The system shall display the newly created campaign in the member's campaign dashboard immediately after creation

#

# \### \*\*F4-URS02:\*\* Members can launch a new product, add its details, include affiliate links, and connect it directly to a chosen campaign

#

# \#### \*\*F4-URS02-SRS01:\*\* The system shall provide an "Add Product" form requiring a product name and allowing selection of an existing campaign to link the product under

#

# \#### \*\*F4-URS02-SRS02:\*\* The system shall provide a product profile editing interface where members can enter detailed product descriptions of up to 1,000 characters

#

# \#### \*\*F4-URS02-SRS03:\*\* The system shall support product image uploads in JPG, PNG, GIF, SVG and WEBP and allow the member to store a maximum of 5 product images per product

#

# \#### \*\*F4-URS02-SRS04:\*\* The system shall display all saved product details, images, and affiliate links on the Library page for editing

#

# \#### \*\*F4-URS02-SRS05:\*\* The system automatically sets a product status as "Active" or "Daft" at creation time from completeness of product particulars

#

# \#### \*\*F4-URS02-SRS06:\*\* The system shall save all changes to the product profile in the database upon the member clicking a "Save" or "Update" button, and display a success confirmation message

#
