# ConfluenceDitch

ConfluenceDitch preserves Confluence knowledge in independently usable archives and produces later outputs for people, AI tools and documentation systems.

## Language

**Takeout**:
A customer-requested acquisition and delivery of an agreed scope of source knowledge in a usable archive.
_Avoid_: Migration when no destination delivery occurs

**Capture**:
A bounded collection of source observations with a selected scope and an acquisition interval. It does not imply that the source was globally frozen at one instant.
_Avoid_: Atomic snapshot when acquisition was observed over time

**Archive**:
A retained collection of source material, readable documents, files, history, provenance and coverage evidence that remains usable outside the service.
_Avoid_: Queue payload, destination workspace

**Source revision**:
A version of one source object identified by the source, with its available content, author and source time.
_Avoid_: Capture version, converter version

**Capture history**:
The succession of observations retained by the service after acquisition starts.
_Avoid_: Original edit history

**Source history**:
The retrievable revisions supplied by the source, including revisions that predate the first capture.
_Avoid_: Git history as a substitute for missing source revisions

**Output**:
A package or destination delivery generated from retained source material under a declared conversion profile.
_Avoid_: Capture when no new source acquisition occurs

**Destination adapter**:
A declared mapping and delivery capability for a particular documentation system or output format.
_Avoid_: Universal importer

**Coverage**:
The relationship between selected scope, observable source inventory and acquisition outcomes, including explicit unknowns and exclusions.
_Avoid_: Completeness based only on matching page counts

**Verification**:
Checks that establish inventory reconciliation, artifact integrity and the declared usability of an output.
_Avoid_: Successful task completion as proof of content fidelity

**Provenance**:
Evidence of where content came from and who created, owned or authored it at the recorded source times.
_Avoid_: Permission grant inferred from authorship

**Source permission evidence**:
Observed access rules, identity memberships and inheritance that can support a source access conclusion at the recorded observation time.
_Avoid_: Enforced archive access

**Archive entitlement**:
The current authority to access an archive or part of it through the service.
_Avoid_: Historical source grant as current authorization

**Organization owner**:
The person with current authority to administer the product organization and its ownership succession. This role does not itself establish document access.
_Avoid_: Source page owner, archive administrator

**Archive administrator**:
A person explicitly authorized to acquire, inspect, export, recover or delete a granted archive scope.
_Avoid_: Organization member as automatic full-export authority

**Effective access**:
A supported conclusion that a principal can or cannot perform an action on a resource, with the supporting rules and membership evidence. Incomplete evidence can leave the conclusion unknown.
_Avoid_: Direct restriction list as the complete access result

**Accepted archive**:
An archive whose authorized customer has confirmed usability for the agreed scope and reviewed its declared material gaps.
_Avoid_: Gap-free archive when exceptions were accepted

**Recovery point**:
A sealed capture whose required technical checks passed and which is eligible for dependable recovery. It does not require commercial or customer sign-off.
_Avoid_: Accepted capture when only technical verification is meant

**Unconfirmed absence**:
A previously observed item that is missing from a later scan without sufficient evidence that it was deleted.
_Avoid_: Deleted when access loss or incomplete inventory could explain absence

**Recovery**:
Retrieval of retained content or restoration of the archive service to a usable state. Native restoration into a destination is a separately supported capability.
_Avoid_: Confluence disaster restore when only readable archive retrieval is supported
