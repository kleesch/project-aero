# Project Overview

This project is a web application designed to provide a variety of administrative and public-facing auditing tools for a ROBLOX community that is roleplaying a mock United States Government. Its goal is to offer members of this community a platform to manage and monitor various aspects of their roleplay, such as hosting and monitoring the progress of bills into law by Congress & the President, host court records attached to certain users, registration of businesses, monitor user information over time (such as employment history, obtained medals/honors from government service, date of citizenship granting, etc). It also should have capacity to provide public-facing details via an API to other group services, such as providing a user's court record or business registration status when requested.

## Users

Users of this application are members of the ROBLOX community with valid ROBLOX accounts. Logging into this application should be done solely via ROBLOX authentication to provide for a secure and seamless experience.
Logging in through ROBLOX also provides us with a unique identifier for each user, which can be used to track their activity and interactions within the application.

Users do not need to be signed into the application to simply view bills and court records.

### User Permissioning

Ideally, the project permission and actioning should work based on claims. Certain claims will provide access to certain read/write features within the site. Some examples:

- Only a user in the Congress group (id 2673501) at or above a certain role number representing a congressional position should be able to access bill submission features.
- Only a user in the main group (id 1025445) at exactly a certain role number representing a presidential position should be able to access bill signing features.
- Only a user in the judicial branch group (id 5250733) at or above a certain role number representing a judge position should be able to access court record submission features.

Users obtain claims through one of two methods:

1. Through membership in a ROBLOX community/group based on a certain role. These should ideally be stored within a database table with the name of the claim based on the group and rank ids, as well as the comparison type. This was we are able to expand claim definitions based on new requirements or features.
   1. Management of these claims should be possible in-platform for administrators. Administrator itself should be a claim, seeded only to the user with id 9725456 to begin with.
2. Through direct grant of a claim by a platform admin. This should be reserved for broad administrative-level claims, such as granting the ability to give a user medals in the system.

The application should actively merge these two claims to provide a standard set of permissions for users based on their group membership and direct grants. This should be provided to the frontend so as to allow for proper rendering of a user's permitted functions.

#### Claim Freshness

ROBLOX group membership is not included in the OAuth token, so group-derived claims must be resolved via the ROBLOX Groups API and cached with a TTL. The frontend's view of a user's claims may lag slightly behind, but the backend must periodically re-validate that a user still holds the group role backing a claim before permitting gated actions.

#### Negative Claims

Administrators should be able to directly grant a **negative** claim to a user. A negative claim blocks the corresponding action regardless of group membership, other direct grants, or cached claim TTLs — it always wins during the claim merge and takes effect immediately.

### User Profiles

A user's actions, bills, court rulings, and businesses should be visible on a profile page.

## Auditing

Auditing of committed actions is essential for this application. It should be designed to track all actions taken within the system, including user interactions, administrative actions, and system events. This data should be stored in a secure and accessible manner, and should be available for review by authorized personnel.
Different actions may need to be gated behind a specific claim for visibility.

## Features

Beyond the actual scope of the login/permissioning and auditing guidelines, the application should include the following functions to begin with:

### Bill Tracking & Signing

Members of Congress should be able to submit bills for tracking (in the form of a .pdf), with the bill then going through a fixed pipeline of stages mirroring how bills are tracked and signed in the real world:

1. Committee (in the originating chamber)
2. Originating chamber floor
3. Other chamber floor
4. Presidential action — the President may **sign** the bill (it becomes law) or **veto** it
5. Veto override — a vetoed bill may return to Congress for an override vote; a successful override enacts the bill despite the veto

The stage list is fixed for now, but should be defined in a single place (enum or table) so that making it configurable later is cheap. A bill that fails at any stage should carry a terminal status (e.g. failed in committee, vetoed with override failed) rather than disappearing.

We should track votes on a bill at each stage (bar signature), and anyone should be allowed to see the bill and its votes at any stage. Votes are **not** cast in-platform — they are recorded after the fact by users holding a vote-update claim, independent by chamber of Congress (that is, a claim for the House and a claim for the Senate). Votes should be attributed to individual members by ROBLOX user id. To support this, the platform should maintain a roster of each congressional body's members via the ROBLOX group API, cached and refreshed daily, with an optional force-resync action for authorized users. Administrators should also be able to modify recorded vote tallies to correct errors.

Between stages, a bill may also be updated with a new version of the pdf. We should store each version of the bill separately for a good audit trail.
Bill status updates should be gated behind the same per-chamber claims. Only the President should be able to sign or veto a bill.

We should ensure to store pdfs in a secure and accessible manner that can be then provided to users browsers for inspection. We should ensure that this is done with user safety as a **critical** consideration, as these pdfs are user-submitted and therefore we cannot guarantee their contents.
We should have a robust way to handle if a user submits a malicious pdf, or for platform administrators to rollback certain actions in the event that a user attempts to harm the integrity of the platform by deleting records or otherwise tampering with the platform.

Bills are assigned a unique identifier generated from the current session of Congress and the bill's submission sequence within that session, prefixed with HB or SB (house bill or senate bill) for chamber of origin. The format is: `<HB|SB><session number><2-digit sequence>`. The final two digits are **always** the bill sequence (a session never produces more than 99 bills per chamber); any preceding digits are the session number. Examples:

1. The first bill submitted in the House during the 80th Congress is HB8001.
2. The second bill submitted in the Senate during the 30th Congress is SB3002.
3. The 22nd bill submitted in the House during the 100th Congress is HB10022.

The session number and sequence should be stored as separate fields, with the display identifier generated from them. We should generate these unique identifiers automatically for good record keeping and reference for later members.

The "current Congress" advances automatically on a month-by-month basis, when elections happen. It should be computed from the calendar month against a fixed epoch rather than manually advanced: July 2026 is the 84th Congress, August 2026 the 85th, and so on. Month boundaries are evaluated in **US Eastern Time** so that a bill submitted near a month rollover is deterministically assigned to the correct session.

We should also have a way to give bills tags for easy categorization and filtering. Available tags should be able to be added by platform administrators, but anyone with bill creation permission should be able to add a tag.

### Judicial Records

The mock government also has a court system, where parties may participate in lawsuits. This platform should exist to enter final judgments, not to track a case through its entire process. When a court ruling is entered, we should collect the following fields:

1. The parties involved.
   1. Parties are **linked entities**, not free text: each party on the plaintiff/prosecution and defendant sides is a reference to a platform user, a registered business, or the United States government itself. This allows rulings to appear on user profiles and business pages, and allows filtering by party type.
   2. When entering a ruling, judges need a good lookup experience for finding and linking the correct entity (e.g. searching users by ROBLOX username/id and businesses by name).
2. The judgement, in the form of a PDF from the issuing judge.
3. The ruling, in the form of a list of statuses (such as "guilty", "not guilty", "dismissed", etc.).
4. The date of the ruling.

Occasionally, a court ruling may be appealed. Our appeals process differs from that of real life, in that any appeal goes directly to the Supreme Court. In this case, we should allow members of the supreme court to upload an additional verdict.

Court records are not necessarily permanent: the platform should support **expungements** and **pardons**. These should not hard-delete the underlying record (the audit trail must be preserved), but should update the record's status and control its public visibility appropriately.

### Business Registration

We should track business entities and their associated information, such as their name and owners, as well as their business registration status (license status, dates, etc). This information should be accessible to all users.

Each business has exactly one **owner**: the user who creates the business entry is assigned as its owner, and only the owner may edit the business's details. Ownership can be transferred to another user. This is intentionally a minimal permission surface separate from the claims system — no representatives, delegates, or per-business roles.

Licenses should be grantable by users with a claim to be determined at a later date.

### Executive Orders

The platform should archive Executive Orders issued by Presidents, replacing the existing external Notion/Google-Drive archive (which must be importable):

1. Each order has a platform-wide sequential number (`EO #12`), a title, an effective date, the issuing President (a linked user), a PDF via the standard document pipeline, and an optional summary.
2. Orders carry a status: **active**, **repealed**, **expired** (temporary orders lapse on an expiry date), or **superseded**. An order may explicitly repeal or supersede an earlier order, and the two records should cross-reference each other.
3. Issuing and correcting orders is gated behind a claim intended for the presidential rank; anyone may browse the archive and read the PDFs.

### User Records (Future Scope)

User records — employment history, medals/honors, and citizenship dates — are currently scattered across other services. The eventual goal is to move them into this platform, with optional backfill from the existing services. These are **not** part of the initial build, but the data model and permissioning should be designed with them in mind:

1. **Employment history**: a daily poll of each government agency's ROBLOX group could track joins and leaves, building an employment timeline per user.
2. **Medals/honors**: grantable by users holding an administrator-assigned claim.
3. **Citizenship**: this remains external. When a citizenship date is needed, query the existing service directly at `https://osfusa.azurewebsites.net/api/immigration/${robloxId}/latest` rather than storing or serving citizenship data from this platform.
