"""The starting playbook, inferred from the sample contracts.

IMPORTANT: these positions are derived, not approved. They come from reading
the five vendor agreements the business team supplied plus the one STERIS
template that came back redlined, and they encode market norms rather than
STERIS's actual negotiating policy. Every rule carries a `basis` citing where
it came from, and the whole set is editable in the Playbook Manager, precisely
so that legal can correct it without a code change.

Replace `basis` with "Business team" as real positions are confirmed. The four
open questions for legal are: the standard MSA template, acceptable liability
multiples, required insurance limits, and which clauses trigger escalation
rather than auto-accept.

Positions are written from the CUSTOMER side. STERIS is the customer in every
sample; a vendor-side playbook would invert most of these.
"""

# Each entry maps onto PlaybookRule. `detection_hints` seeds the classifier
# with the vocabulary a clause of this type actually uses.
SEED_RULES: list[dict] = [
    # ---------------------------------------------------------------- liability
    {
        "clause_type": "LIABILITY_CAP",
        "title": "Limitation of liability - cap amount",
        "preferred_position": (
            "Cap set at the greater of 2x the fees paid in the preceding 12 months "
            "or a fixed floor appropriate to the risk of the engagement."
        ),
        "fallback_position": (
            "12 months of fees paid, provided the carve-outs in LIABILITY_CARVEOUTS "
            "are all present and sit outside the cap."
        ),
        "walkaway_position": (
            "Any cap below 12 months of fees, or a cap that also limits the vendor's "
            "indemnity and confidentiality obligations."
        ),
        "standard_language": (
            "EXCEPT FOR THE EXCLUDED CLAIMS SET OUT BELOW, EACH PARTY'S TOTAL "
            "AGGREGATE LIABILITY ARISING OUT OF OR RELATING TO THIS AGREEMENT SHALL "
            "NOT EXCEED TWO TIMES (2X) THE FEES PAID OR PAYABLE BY CUSTOMER UNDER "
            "THIS AGREEMENT IN THE TWELVE (12) MONTHS PRECEDING THE EVENT GIVING "
            "RISE TO LIABILITY."
        ),
        "guidance": (
            "All four vendor templates in the sample set converge on 12 months of "
            "fees, so that is the realistic settling point rather than the opening "
            "ask. Push on the carve-outs before pushing on the multiple - an "
            "uncapped data-breach carve-out is worth far more than 2x."
        ),
        "basis": (
            "Box s.13.1, Superhuman s.9.1, Canto s.8(a) all cap at 12 months of fees."
        ),
        "severity": "NEGOTIABLE",
        "is_required": True,
        "detection_hints": (
            "total aggregate liability; cumulative liability; shall not exceed; "
            "fees paid in the twelve months; limitation of liability"
        ),
    },
    {
        "clause_type": "LIABILITY_CARVEOUTS",
        "title": "Limitation of liability - exclusions from the cap",
        "preferred_position": (
            "The cap does not apply to: breach of confidentiality; data security "
            "breach and privacy violations; indemnification obligations; "
            "infringement of the other party's IP; fraud or wilful misconduct; "
            "death or personal injury; and payment obligations."
        ),
        "fallback_position": (
            "Confidentiality, indemnity, IP infringement and fraud carved out; "
            "data breach subject to a separate enhanced cap (e.g. 5x fees)."
        ),
        "walkaway_position": (
            "Death/personal injury as the only carve-out, leaving a data breach "
            "capped at 12 months of fees."
        ),
        "standard_language": (
            "The foregoing limitation shall not apply to: (a) either party's "
            "indemnification obligations; (b) breach of confidentiality "
            "obligations; (c) Vendor's breach of its data security or data "
            "protection obligations; (d) either party's fraud, gross negligence or "
            "wilful misconduct; (e) death or personal injury caused by negligence; "
            "or (f) Customer's payment obligations."
        ),
        "guidance": (
            "This is the highest-value liability redline and the one vendors concede "
            "most often, because each carve-out is individually defensible. Note that "
            "a data-security carve-out is absent from every sample - it has to be "
            "added, it will never be offered."
        ),
        "basis": (
            "Box s.13.1 carves out only death/personal injury - no confidentiality, "
            "indemnity or data-breach carve-out. Superhuman s.9.3 and Canto s.8(a) "
            "are materially better, which proves the ask is winnable."
        ),
        "severity": "UNACCEPTABLE",
        "is_required": True,
        "detection_hints": (
            "foregoing limitation does not apply; shall not apply to; unlimited "
            "liabilities; nothing in this agreement excludes or limits"
        ),
    },
    {
        "clause_type": "LIABILITY_MUTUALITY",
        "title": "Limitation of liability - must be mutual",
        "preferred_position": "The liability cap applies equally to both parties.",
        "fallback_position": (
            "Asymmetry accepted only where the vendor's cap is materially higher "
            "than the customer's."
        ),
        "walkaway_position": (
            "A cap that limits only the vendor's liability while leaving the "
            "customer exposed without limit."
        ),
        "standard_language": (
            "EACH PARTY'S TOTAL AGGREGATE LIABILITY ARISING OUT OF OR RELATING TO "
            "THIS AGREEMENT SHALL NOT EXCEED..."
        ),
        "guidance": (
            "Easy to miss on a fast read because the clause looks standard until you "
            "notice whose liability it actually limits. Check the subject of the "
            "sentence, not the number."
        ),
        "basis": (
            "Box s.13.1 limits only 'BOX'S AND ITS AFFILIATES' TOTAL AND CUMULATIVE "
            "LIABILITY'. Superhuman s.9.1 and Canto s.8(a) both say 'each party'."
        ),
        "severity": "UNACCEPTABLE",
        "is_required": False,
        "detection_hints": (
            "vendor's total liability; supplier's aggregate liability; "
            "in no event will [vendor] be liable"
        ),
    },
    {
        "clause_type": "CLAIM_LIMITATION_PERIOD",
        "title": "Contractual shortening of the limitation period",
        "preferred_position": (
            "Silent - the statutory limitation period applies unmodified."
        ),
        "fallback_position": "No shorter than two years, and mutual.",
        "walkaway_position": (
            "Any one-way shortening that binds only the customer, or any period "
            "under one year."
        ),
        "standard_language": "",
        "guidance": (
            "Frequently buried inside the limitation-of-liability clause rather than "
            "given its own heading, which is why it survives review. Deleting the "
            "sentence outright is usually accepted since vendors rarely treat it as "
            "load-bearing."
        ),
        "basis": (
            "Superhuman s.9.1 ends with a one-year bar running against Customer only: "
            "'NO CLAIM... MAY BE MADE... BY CUSTOMER MORE THAN ONE (1) YEAR AFTER "
            "THE TERMINATION OR EXPIRATION OF THIS AGREEMENT.'"
        ),
        "severity": "UNACCEPTABLE",
        "is_required": False,
        "detection_hints": (
            "no claim regardless of form; more than one year after; must be brought "
            "within; barred unless brought"
        ),
    },
    {
        "clause_type": "CONSEQUENTIAL_DAMAGES",
        "title": "Waiver of indirect and consequential damages",
        "preferred_position": (
            "Mutual waiver, with breach of confidentiality and data security "
            "obligations excluded from the waiver."
        ),
        "fallback_position": "Mutual waiver with no exclusions.",
        "walkaway_position": "A one-way waiver protecting only the vendor.",
        "standard_language": (
            "NEITHER PARTY SHALL BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, "
            "PUNITIVE OR CONSEQUENTIAL DAMAGES, PROVIDED THAT THIS EXCLUSION SHALL "
            "NOT APPLY TO BREACHES OF CONFIDENTIALITY OR DATA SECURITY OBLIGATIONS."
        ),
        "guidance": (
            "Standard and generally acceptable when mutual. The real issue is that a "
            "data breach's cost is almost entirely consequential loss, so without the "
            "carve-out the vendor's exposure is close to nil."
        ),
        "basis": "Box s.13.2, Superhuman s.9.2, Canto s.8(a)(i) - all mutual.",
        "severity": "NEGOTIABLE",
        "is_required": False,
        "detection_hints": (
            "indirect incidental special punitive; loss of profits; loss of goodwill; "
            "consequential damages"
        ),
    },
    # -------------------------------------------------------------- indemnities
    {
        "clause_type": "VENDOR_IP_INDEMNITY",
        "title": "Vendor IP infringement indemnity",
        "preferred_position": (
            "Vendor defends and indemnifies the customer against third-party claims "
            "that the service infringes IP rights, uncapped, with the vendor "
            "controlling the defence and unable to settle without releasing the "
            "customer."
        ),
        "fallback_position": (
            "Indemnity capped at a multiple of fees well above the general cap."
        ),
        "walkaway_position": (
            "No IP indemnity, or one subject to the general liability cap."
        ),
        "standard_language": (
            "Vendor shall defend, indemnify and hold harmless Customer against any "
            "third-party claim alleging that the Services infringe or misappropriate "
            "any patent, copyright, trademark, trade secret or other intellectual "
            "property right, and shall pay all damages and costs finally awarded or "
            "agreed in settlement. This obligation shall not be subject to the "
            "limitation of liability set out in this Agreement."
        ),
        "guidance": (
            "Check the exclusions as carefully as the grant. Exclusions for "
            "combination with other products and for modification are standard; an "
            "exclusion for the customer's own inputs is not, in a service the "
            "customer necessarily feeds data into."
        ),
        "basis": (
            "Box s.12.1, Superhuman s.10.1 and Vimeo's AI Addendum all grant one; "
            "Vimeo's carves out claims caused by 'Customer's Input', which hollows it "
            "out for a generative tool."
        ),
        "severity": "UNACCEPTABLE",
        "is_required": True,
        "detection_hints": (
            "will defend customer against; indemnify and hold harmless; claim against "
            "customer; infringement of intellectual property"
        ),
    },
    {
        "clause_type": "CUSTOMER_INDEMNITY",
        "title": "Customer indemnity - scope must be narrow",
        "preferred_position": (
            "Limited to the customer's own content and use of the service in "
            "violation of the agreement; capped at the same amount as the vendor's "
            "liability cap."
        ),
        "fallback_position": "Uncapped but limited to third-party claims only.",
        "walkaway_position": (
            "An open-ended obligation to indemnify the vendor for 'any claim arising "
            "from Customer's use of the Services'."
        ),
        "standard_language": (
            "Customer shall indemnify Vendor against third-party claims arising from "
            "Customer Content that infringes such third party's intellectual property "
            "rights, provided that Customer's total liability under this Section "
            "shall not exceed the cap set out in the Limitation of Liability section."
        ),
        "guidance": (
            "Customer indemnities are routinely drafted broader than the vendor's and "
            "left uncapped while the vendor's own liability is capped. Symmetry is the "
            "argument to make."
        ),
        "basis": "Box s.12.2, Superhuman s.10.2, Canto s.7(b).",
        "severity": "NEGOTIABLE",
        "is_required": False,
        "detection_hints": (
            "customer will defend; customer shall indemnify; claim against vendor; "
            "arising from customer content"
        ),
    },
    # ---------------------------------------------------------------------- AI
    {
        "clause_type": "AI_TRAINING_DATA",
        "title": "No training of AI models on customer data",
        "preferred_position": (
            "Vendor and its subprocessors shall not use customer data, inputs or "
            "outputs to train, fine-tune, test or improve any AI or machine learning "
            "model, without exception."
        ),
        "fallback_position": (
            "No training without the customer's prior written consent, with the same "
            "restriction flowed down to all third-party model providers."
        ),
        "walkaway_position": (
            "Training permitted on an opt-out basis, or silence on the point."
        ),
        "standard_language": (
            "Vendor shall not, and shall ensure that its subprocessors and any "
            "third-party model providers do not, use Customer Data, Inputs or Outputs "
            "to train, fine-tune, test, validate or otherwise improve any artificial "
            "intelligence or machine learning model, without Customer's prior written "
            "consent."
        ),
        "guidance": (
            "The winnable ask is the flow-down to third-party model providers. A "
            "vendor promising not to train its own models says nothing about the "
            "foundation model sitting behind its feature."
        ),
        "basis": (
            "Superhuman s.5.4 and Vimeo AI Addendum both already prohibit it without "
            "consent, and Vimeo expressly flows the restriction down to third-party "
            "providers - so the strong version is market-standard, not a stretch. "
            "STERIS's own AI Addendum demands prior permission."
        ),
        "severity": "UNACCEPTABLE",
        "is_required": True,
        "detection_hints": (
            "train generative artificial intelligence models; will not use customer "
            "data to train; model training; fine-tune; improve our models"
        ),
    },
    {
        "clause_type": "AI_DISCLOSURE",
        "title": "Advance notice of AI use in providing the services",
        "preferred_position": (
            "Vendor must give advance written notice before using AI - including by "
            "any subcontractor - to provide the services."
        ),
        "fallback_position": (
            "Notice at the point AI features are enabled, with the ability to disable "
            "them."
        ),
        "walkaway_position": "No disclosure obligation at all.",
        "standard_language": (
            "Vendor shall provide advance written notification to Customer of any use "
            "of artificial intelligence, in whole or in part, to provide the Services, "
            "including any such use by a subcontractor, prior to any such use."
        ),
        "guidance": (
            "STERIS's own template treats this as a baseline requirement. Vimeo offers "
            "a weaker but workable version: AI features are opt-out via team settings "
            "with reasonable efforts to notify before launch."
        ),
        "basis": (
            "STERIS AI Addendum, 'Notice of AI Use'. Compare Vimeo AI Addendum, "
            "'Access to Generative Tools'."
        ),
        "severity": "NEGOTIABLE",
        "is_required": True,
        "detection_hints": (
            "notice of ai use; advance written notification; artificial intelligence "
            "tools; generative tools; sparkle icon"
        ),
    },
    {
        "clause_type": "AI_INDEMNITY",
        "title": "AI output indemnity and its exclusions",
        "preferred_position": (
            "Vendor indemnifies the customer for IP claims arising from AI outputs, "
            "uncapped, with no exclusion for customer inputs."
        ),
        "fallback_position": (
            "Mutual indemnity with a separate enhanced cap, reflecting shared "
            "responsibility where the customer writes the prompts."
        ),
        "walkaway_position": (
            "No AI-specific indemnity, or one excluding anything arising from "
            "customer input - which in a generative tool is everything."
        ),
        "standard_language": (
            "Vendor shall defend and indemnify Customer against any third-party claim "
            "alleging that Output generated by the Vendor AI Products infringes or "
            "misappropriates such third party's intellectual property rights. This "
            "obligation shall not be subject to the limitation of liability set out "
            "in this Agreement."
        ),
        "guidance": (
            "Expect the counterparty to argue shared responsibility, and expect that "
            "argument to have real force where the customer's staff write the prompts "
            "and publish the outputs. Decide in advance whether mutuality plus a "
            "meaningful cap is an acceptable landing point - it is where the one "
            "negotiation in the sample set ended up."
        ),
        "basis": (
            "STERIS's AI Addendum opened with an uncapped one-way vendor indemnity; "
            "Scribe's redline (Morgan Nash, 25 Sep 2025) made it mutual and capped it "
            "at USD 200,000, arguing content is a shared responsibility. Vimeo grants "
            "one but excludes claims caused by Customer's Input."
        ),
        "severity": "UNACCEPTABLE",
        "is_required": True,
        "detection_hints": (
            "indemnifying party; arising out of the use of artificial intelligence; "
            "ai indemnity; output infringes"
        ),
    },
    {
        "clause_type": "AI_HUMAN_REVIEW",
        "title": "Accuracy and human review of AI output",
        "preferred_position": (
            "Vendor is responsible for verifying and fact-checking AI-generated "
            "content and for ensuring outputs do not include third-party copyrighted "
            "material."
        ),
        "fallback_position": (
            "Vendor provides the tooling for customer review and labels unreviewed "
            "AI-generated content; responsibility for publication sits with whoever "
            "publishes."
        ),
        "walkaway_position": (
            "Vendor disclaims all responsibility for output accuracy while also "
            "restricting the customer's ability to review it."
        ),
        "standard_language": (
            "Where Generative AI is used to produce content for Customer, Vendor "
            "shall verify and fact-check such content, and shall provide "
            "functionality enabling Customer to review and edit the content prior to "
            "use. AI-generated content produced without human review shall be labelled "
            "as such."
        ),
        "guidance": (
            "The most contested clause in the sample set, and the counterparty's "
            "position is not unreasonable: where the customer's own staff prompt the "
            "tool and publish the result, they are the humans in the loop. Aim for "
            "clear allocation rather than total transfer."
        ),
        "basis": (
            "STERIS AI Addendum required the vendor to 'verify and fact check any "
            "content generated by GAI'; Scribe deleted that clause entirely and "
            "softened the copyright obligation to providing review functionality."
        ),
        "severity": "NEGOTIABLE",
        "is_required": False,
        "detection_hints": (
            "verify and fact check; review and edit content; human involvement; "
            "independently review assess and validate; generated by ai"
        ),
    },
    # ------------------------------------------------------------ data / privacy
    {
        "clause_type": "DATA_SECURITY",
        "title": "Information security obligations",
        "preferred_position": (
            "Vendor maintains a documented security programme aligned to a named "
            "standard (ISO 27001 or SOC 2 Type II), evidenced by an annual report "
            "provided to the customer."
        ),
        "fallback_position": (
            "Appropriate technical and organisational measures, with the certification "
            "named in an exhibit."
        ),
        "walkaway_position": (
            "'Commercially reasonable' security with no named standard and no evidence "
            "obligation."
        ),
        "standard_language": (
            "Vendor shall maintain an information security programme aligned with ISO "
            "27001 or SOC 2 Type II and shall provide Customer with a copy of its "
            "most recent audit report annually upon request."
        ),
        "guidance": (
            "'Appropriate technical and organisational measures' is unmeasurable on "
            "its own. Anchor it to a certification the vendor already holds - the ask "
            "then costs them nothing and gives you an audit trail."
        ),
        "basis": "Superhuman s.3.1 - appropriate measures, no named standard.",
        "severity": "NEGOTIABLE",
        "is_required": True,
        "detection_hints": (
            "technical and organizational measures; information security programme; "
            "security controls; iso 27001; soc 2"
        ),
    },
    {
        "clause_type": "BREACH_NOTIFICATION",
        "title": "Security incident notification",
        "preferred_position": (
            "Vendor notifies the customer without undue delay and in any event within "
            "48 hours of becoming aware of a security incident affecting customer "
            "data, and cooperates with the customer's investigation."
        ),
        "fallback_position": "Notification within 72 hours.",
        "walkaway_position": (
            "No notification commitment, or notification only where legally required."
        ),
        "standard_language": (
            "Vendor shall notify Customer without undue delay and in any event within "
            "forty-eight (48) hours after becoming aware of any Security Incident "
            "affecting Customer Data, and shall provide Customer with all information "
            "reasonably required to meet its own regulatory notification obligations."
        ),
        "guidance": (
            "Very often absent from the main agreement and present only in the DPA, "
            "and then only for personal data - which leaves confidential business data "
            "uncovered. Check both documents."
        ),
        "basis": (
            "No sample agreement contains a breach-notification clause in its main "
            "body; this is a gap, flagged as a required rule so it surfaces as MISSING."
        ),
        "severity": "UNACCEPTABLE",
        "is_required": True,
        "detection_hints": (
            "security incident; personal data breach; notify customer without undue "
            "delay; breach notification"
        ),
    },
    {
        "clause_type": "DPA_PERSONAL_DATA",
        "title": "Data processing addendum",
        "preferred_position": (
            "A DPA is executed alongside the agreement wherever personal data is "
            "processed, incorporating the EU Standard Contractual Clauses where "
            "relevant."
        ),
        "fallback_position": (
            "DPA incorporated by reference, provided the customer has reviewed the "
            "referenced version and it cannot be amended unilaterally."
        ),
        "walkaway_position": "No DPA where personal data is in scope.",
        "standard_language": (
            "To the extent Vendor processes Personal Data on behalf of Customer, the "
            "parties shall execute the Data Processing Addendum attached hereto, which "
            "shall incorporate the Standard Contractual Clauses where required."
        ),
        "guidance": (
            "Vimeo's Exhibit B is a reasonable model to benchmark against. Where the "
            "DPA is incorporated by URL rather than attached, treat it under "
            "INCORPORATION_BY_URL as well."
        ),
        "basis": (
            "Vimeo Exhibit B (full DPA with SCCs); Superhuman s.3.2 incorporates one "
            "by reference. STERIS's AI Addendum requires one for AI processing of PI."
        ),
        "severity": "NEGOTIABLE",
        "is_required": True,
        "detection_hints": (
            "data processing addendum; standard contractual clauses; controller; "
            "processor; personal data"
        ),
    },
    {
        "clause_type": "SUBPROCESSOR_CONSENT",
        "title": "Subprocessor approval and flow-down",
        "preferred_position": (
            "Prior written consent required for each new subprocessor, with all "
            "obligations flowed down and the vendor remaining liable for their acts."
        ),
        "fallback_position": (
            "Notice of new subprocessors with a right to object and terminate without "
            "penalty."
        ),
        "walkaway_position": (
            "General authorisation with no notice and no objection right."
        ),
        "standard_language": (
            "Vendor shall not engage any subprocessor to process Customer Data without "
            "Customer's prior written authorisation. Vendor shall impose obligations "
            "no less protective than those in this Agreement on each subprocessor and "
            "shall remain fully liable for their performance."
        ),
        "guidance": (
            "Prior consent per subprocessor is rarely granted by scaled SaaS vendors. "
            "Notice plus a genuine termination right is the realistic win."
        ),
        "basis": (
            "STERIS AI Addendum requires prior written authorisation for AI "
            "subprocessors. Vimeo Annex III uses general authorisation, the weaker "
            "market norm."
        ),
        "severity": "NEGOTIABLE",
        "is_required": False,
        "detection_hints": (
            "subprocessor; sub-processor; general authorization; engage third parties "
            "to process"
        ),
    },
    {
        "clause_type": "DATA_RETURN_DELETION",
        "title": "Return and deletion of data on termination",
        "preferred_position": (
            "Customer may export its data throughout the term and for at least 60 days "
            "after termination; vendor certifies deletion thereafter."
        ),
        "fallback_position": "30-day export window with deletion on request.",
        "walkaway_position": (
            "Immediate loss of access on termination, or deletion without an export "
            "window."
        ),
        "standard_language": (
            "For sixty (60) days following termination or expiration, Vendor shall "
            "make Customer Data available for export. Thereafter Vendor shall delete "
            "Customer Data and certify such deletion in writing upon request."
        ),
        "guidance": (
            "Check this against the suspension clause - a right to suspend access can "
            "silently defeat an export right if suspension cuts off the export "
            "mechanism."
        ),
        "basis": (
            "Box s.11.5 gives 30 days post-termination; Superhuman s.7.6 and s.3.3 "
            "are comparable; Canto s.9(a) terminates access immediately on any "
            "termination, which is the outlier to fix."
        ),
        "severity": "NEGOTIABLE",
        "is_required": True,
        "detection_hints": (
            "upon termination customer data; export customer data; delete customer "
            "data; retrieval period; effect of termination"
        ),
    },
    # ------------------------------------------------------- commercial / term
    {
        "clause_type": "CONFIDENTIALITY_TERM",
        "title": "Confidentiality - duration and carve-outs",
        "preferred_position": (
            "Obligations survive for five years after termination, and indefinitely "
            "for trade secrets and personal data."
        ),
        "fallback_position": "Three years post-termination, mutual.",
        "walkaway_position": (
            "Obligations expiring with the agreement, or a one-way obligation binding "
            "only the customer."
        ),
        "standard_language": (
            "The obligations in this Section shall survive for five (5) years "
            "following termination of this Agreement, and shall continue indefinitely "
            "with respect to trade secrets and Personal Data."
        ),
        "guidance": (
            "Confirm the definition of Confidential Information covers information "
            "disclosed orally and by observation, not only material marked "
            "confidential in writing."
        ),
        "basis": "Box s.14, Superhuman s.4, Canto s.6 - all mutual.",
        "severity": "NEGOTIABLE",
        "is_required": False,
        "detection_hints": (
            "confidential information; obligations shall survive; nondisclosure; "
            "recipient of confidential information"
        ),
    },
    {
        "clause_type": "ORDER_OF_PRECEDENCE",
        "title": "Order of precedence between documents",
        "preferred_position": (
            "The negotiated agreement and its exhibits prevail over any online or "
            "referenced terms, and the order form prevails over the agreement only for "
            "commercial terms."
        ),
        "fallback_position": (
            "Online terms rank last, with any conflict resolved in favour of the "
            "negotiated agreement."
        ),
        "walkaway_position": (
            "Any structure where vendor-controlled online terms override the "
            "negotiated agreement."
        ),
        "standard_language": (
            "In the event of any conflict, the following order of precedence shall "
            "apply: (a) this Agreement and its exhibits; (b) the applicable Order "
            "Form, solely as to commercial terms; (c) any terms incorporated by "
            "reference."
        ),
        "guidance": (
            "A precedence clause that puts online terms first lets the vendor amend "
            "the contract by editing a web page. Always read it together with "
            "INCORPORATION_BY_URL."
        ),
        "basis": (
            "Superhuman s.1.6.1 states the Developer Terms 'will prevail' over the "
            "agreement - a direct inversion. Vimeo s.12.10 ranks online terms last, "
            "which is the correct shape."
        ),
        "severity": "UNACCEPTABLE",
        "is_required": False,
        "detection_hints": (
            "order of precedence; in the event of a conflict; shall control; will "
            "prevail; conflicting terms"
        ),
    },
    {
        "clause_type": "INCORPORATION_BY_URL",
        "title": "Terms incorporated by hyperlink",
        "preferred_position": (
            "All operative terms are attached as exhibits. Any incorporated terms are "
            "frozen at a dated version attached to the agreement."
        ),
        "fallback_position": (
            "Incorporation permitted, but changes require notice and give the customer "
            "a right to terminate if materially adverse."
        ),
        "walkaway_position": (
            "Definitions or core obligations located at a URL the vendor may change at "
            "will."
        ),
        "standard_language": (
            "Any terms incorporated by reference are incorporated as at the Effective "
            "Date in the form attached as an exhibit. Vendor may not modify such terms "
            "in a manner materially adverse to Customer without Customer's written "
            "consent."
        ),
        "guidance": (
            "Capture a dated PDF of every referenced URL at signature. It is the only "
            "way to prove later what the terms said on the day you signed."
        ),
        "basis": (
            "Box s.1 defines capitalised terms via box.com/legal/product-terms. "
            "Superhuman incorporates Developer Terms, AUP and Third-Party Terms by "
            "URL; Vimeo references five separate online addenda."
        ),
        "severity": "NEGOTIABLE",
        "is_required": False,
        "detection_hints": (
            "located at; found at the following link; available at https; "
            "incorporated herein by reference; as updated from time to time"
        ),
    },
    {
        "clause_type": "UNILATERAL_CHANGE",
        "title": "Vendor's right to change the service",
        "preferred_position": (
            "No material reduction in functionality during the subscription term; "
            "advance notice of material changes with a termination right if adverse."
        ),
        "fallback_position": (
            "No material decrease in core functionality, as measured against the "
            "documentation in force at the effective date."
        ),
        "walkaway_position": (
            "An unrestricted right to modify or discontinue features mid-term."
        ),
        "standard_language": (
            "Vendor shall not materially decrease the core functionality of the "
            "Services during the Subscription Term. Vendor shall give Customer at "
            "least ninety (90) days' notice of any material change, and Customer may "
            "terminate without penalty and receive a pro-rata refund if the change is "
            "materially adverse."
        ),
        "guidance": (
            "Superhuman's wording is a good precedent to quote back at other vendors, "
            "since it concedes the principle already."
        ),
        "basis": (
            "Superhuman s.1.4 - 'will not materially decrease the core functionality "
            "of the Services during the Subscription Term.'"
        ),
        "severity": "NEGOTIABLE",
        "is_required": False,
        "detection_hints": (
            "may modify the features; changes to the services; regularly evolving; "
            "discontinue any feature"
        ),
    },
    {
        "clause_type": "SUSPENSION",
        "title": "Vendor's right to suspend the service",
        "preferred_position": (
            "Suspension only for non-payment after notice and a cure period, or where "
            "required by law, and limited to the affected users."
        ),
        "fallback_position": (
            "Advance notice and an opportunity to cure before any suspension, except "
            "for genuine security emergencies."
        ),
        "walkaway_position": (
            "Suspension at the vendor's discretion without notice or cure."
        ),
        "standard_language": (
            "Vendor may suspend the Services only (a) where Customer's payment is more "
            "than thirty (30) days overdue and Vendor has given ten (10) days' written "
            "notice, or (b) where necessary to address a material security risk. Any "
            "suspension shall be limited in scope and duration to what is strictly "
            "necessary."
        ),
        "guidance": (
            "Canto's clause is a reasonable model: it already includes advance notice, "
            "a 10-day cure period, and a proportionality limit."
        ),
        "basis": (
            "Canto s.9(b) - notice plus 10 days to cure, suspension only as long as "
            "necessary. Superhuman s.7.5 is broader."
        ),
        "severity": "NEGOTIABLE",
        "is_required": False,
        "detection_hints": (
            "may suspend; suspension of the services; temporarily suspend; past due"
        ),
    },
    {
        "clause_type": "TERMINATION_CURE",
        "title": "Termination for cause and cure period",
        "preferred_position": (
            "Either party may terminate for material breach on 30 days' notice if the "
            "breach is not cured, with a pro-rata refund of prepaid fees."
        ),
        "fallback_position": "30-day cure, refund of prepaid unused fees.",
        "walkaway_position": (
            "No refund on termination for vendor breach, or an asymmetric cure period."
        ),
        "standard_language": (
            "Either party may terminate this Agreement upon thirty (30) days' written "
            "notice of a material breach that remains uncured. Where Customer "
            "terminates for Vendor's breach, Vendor shall refund all prepaid fees for "
            "the unused portion of the term."
        ),
        "guidance": (
            "Canto expressly preserves indemnification rights after a refund, which is "
            "worth replicating - otherwise a refund can be argued to be the sole "
            "remedy."
        ),
        "basis": "Canto s.9(a); Superhuman s.7.4; Box s.11.3.",
        "severity": "NEGOTIABLE",
        "is_required": True,
        "detection_hints": (
            "material breach; thirty days written notice; termination for cause; does "
            "not cure such breach"
        ),
    },
    {
        "clause_type": "AUTO_RENEWAL",
        "title": "Automatic renewal and notice period",
        "preferred_position": (
            "No automatic renewal; renewal by mutual written agreement."
        ),
        "fallback_position": (
            "Auto-renewal with no more than 30 days' notice required to cancel, and "
            "advance written notice of the renewal date."
        ),
        "walkaway_position": (
            "Auto-renewal requiring 90 days' notice, or renewal at an uncapped price."
        ),
        "standard_language": (
            "This Agreement shall not renew automatically. Any renewal shall be by "
            "mutual written agreement of the parties."
        ),
        "guidance": (
            "Read alongside FEE_INCREASE. Auto-renewal is only benign where the "
            "renewal price is capped."
        ),
        "basis": "Superhuman s.7.2; Canto s.9(a) ties the term to open order forms.",
        "severity": "NEGOTIABLE",
        "is_required": False,
        "detection_hints": (
            "automatically renew; renewal term; unless either party provides notice; "
            "subscription cancellation"
        ),
    },
    {
        "clause_type": "FEE_INCREASE",
        "title": "Price increases on renewal",
        "preferred_position": (
            "Renewal pricing fixed for the first two renewal terms; thereafter capped "
            "at CPI or 3%, whichever is lower."
        ),
        "fallback_position": (
            "Increases capped at 5% per renewal with at least 60 days' notice."
        ),
        "walkaway_position": "Uncapped increases at the vendor's discretion.",
        "standard_language": (
            "Fees for any renewal term shall not increase by more than the lesser of "
            "three percent (3%) or the change in CPI over the preceding twelve months, "
            "and Vendor shall give at least sixty (60) days' written notice of any "
            "increase."
        ),
        "guidance": (
            "A notice obligation is not a cap. Superhuman only promises to tell you "
            "the price is going up, which constrains nothing."
        ),
        "basis": "Superhuman s.2.4 - notice of fee changes, no cap on the increase.",
        "severity": "NEGOTIABLE",
        "is_required": False,
        "detection_hints": (
            "notice of fee changes; increase the fees; renewal pricing; then-current "
            "list price"
        ),
    },
    # ------------------------------------------------------------- disputes
    {
        "clause_type": "GOVERNING_LAW",
        "title": "Governing law and venue",
        "preferred_position": (
            "Ohio law with venue in Ohio, consistent with STERIS's home jurisdiction."
        ),
        "fallback_position": (
            "Delaware or New York law - neutral, well-developed commercial law."
        ),
        "walkaway_position": (
            "The vendor's home jurisdiction where it is inconvenient or unfavourable, "
            "or any non-US forum."
        ),
        "standard_language": (
            "This Agreement shall be governed by the laws of the State of Ohio, "
            "without regard to its conflict of laws principles, and the parties submit "
            "to the exclusive jurisdiction of the state and federal courts located in "
            "Ohio."
        ),
        "guidance": (
            "CONFIRM WITH LEGAL - Ohio is inferred from STERIS's US headquarters, not "
            "from any supplied instruction. Vendors concede governing law less often "
            "than most other terms, so weigh how hard to push."
        ),
        "basis": (
            "Inferred, not supplied. Samples vary: Superhuman s.12.7 California, "
            "Canto s.10(a) Delaware."
        ),
        "severity": "NEGOTIABLE",
        "is_required": True,
        "detection_hints": (
            "governed by the laws of; conflict of laws; exclusive jurisdiction; venue"
        ),
    },
    {
        "clause_type": "ARBITRATION_CLASS_WAIVER",
        "title": "Mandatory arbitration and class action waiver",
        "preferred_position": (
            "No mandatory arbitration; disputes resolved in court, with an optional "
            "good-faith executive escalation first."
        ),
        "fallback_position": (
            "Arbitration by mutual agreement at the time of the dispute, not "
            "pre-committed."
        ),
        "walkaway_position": (
            "Mandatory binding arbitration in the vendor's home forum with a class "
            "action waiver."
        ),
        "standard_language": (
            "The parties shall first attempt to resolve any dispute through good-faith "
            "negotiation between senior executives. Failing resolution within thirty "
            "(30) days, either party may pursue its remedies in a court of competent "
            "jurisdiction."
        ),
        "guidance": (
            "Consumer-style arbitration clauses appear in enterprise SaaS paper "
            "because the template is shared with the self-serve product. Vendors often "
            "strike it for enterprise customers when asked directly."
        ),
        "basis": (
            "Superhuman s.11 imposes mandatory arbitration and s.11.2 waives class "
            "actions, with s.11.3 carving out governmental entities only. Canto "
            "s.10(b) uses executive escalation instead, which is the better model."
        ),
        "severity": "UNACCEPTABLE",
        "is_required": False,
        "detection_hints": (
            "mandatory arbitration; binding arbitration; class action; jury trial "
            "waiver; arbitration requirements"
        ),
    },
    # ------------------------------------------------------------- assurance
    {
        "clause_type": "AUDIT_RIGHTS",
        "title": "Audit and assessment rights",
        "preferred_position": (
            "Annual audit right on reasonable notice, or provision of an equivalent "
            "third-party audit report (SOC 2 Type II) plus completed security "
            "questionnaires on request."
        ),
        "fallback_position": (
            "Annual SOC 2 report and security questionnaire responses, with on-site "
            "audit rights triggered only by a security incident."
        ),
        "walkaway_position": "No audit right and no assurance reporting.",
        "standard_language": (
            "Upon reasonable notice and no more than once annually, Vendor shall "
            "provide Customer with its most recent SOC 2 Type II report and shall "
            "respond to Customer's reasonable security due-diligence enquiries. "
            "Following any Security Incident, Customer may conduct an audit of the "
            "controls relevant to the incident."
        ),
        "guidance": (
            "Absent from every sample agreement. Vendors resist open-ended on-site "
            "audit but usually accept the report-plus-questionnaire formulation."
        ),
        "basis": (
            "Gap - no sample contains an audit right. Flagged as required so it "
            "surfaces as MISSING."
        ),
        "severity": "NEGOTIABLE",
        "is_required": True,
        "detection_hints": (
            "audit rights; right to audit; soc 2 report; security assessment; "
            "penetration test"
        ),
    },
    {
        "clause_type": "INSURANCE",
        "title": "Insurance requirements",
        "preferred_position": (
            "Vendor maintains commercial general liability, professional "
            "indemnity/E&O and cyber liability cover at limits appropriate to the "
            "engagement, evidenced by certificate."
        ),
        "fallback_position": (
            "Cyber and E&O cover at a minimum of USD 5,000,000, certificate on "
            "request."
        ),
        "walkaway_position": "No insurance obligation where sensitive data is in scope.",
        "standard_language": (
            "Vendor shall maintain, at its own expense, commercial general liability, "
            "professional liability (errors and omissions) and cyber liability "
            "insurance with limits of not less than USD 5,000,000 per occurrence, and "
            "shall provide certificates of insurance upon request."
        ),
        "guidance": (
            "CONFIRM WITH LEGAL - the USD 5m figure is a placeholder. Insurance is one "
            "of the four items to confirm with the business team, since limits are "
            "usually set by risk management rather than by legal."
        ),
        "basis": (
            "Gap - no sample contains an insurance clause, and no limits were "
            "supplied. Placeholder figure pending confirmation."
        ),
        "severity": "NEGOTIABLE",
        "is_required": True,
        "detection_hints": (
            "insurance; certificate of insurance; commercial general liability; cyber "
            "liability; errors and omissions"
        ),
    },
    {
        "clause_type": "WARRANTY_REMEDY",
        "title": "Service warranty and remedy",
        "preferred_position": (
            "Service will perform materially in accordance with the documentation "
            "throughout the term; remedy is repair, then replacement, then a pro-rata "
            "refund, without prejudice to other remedies."
        ),
        "fallback_position": (
            "Warranty for the term with termination and pro-rata refund as the remedy."
        ),
        "walkaway_position": (
            "Warranty disclaimed entirely, or a remedy limited to termination with no "
            "refund."
        ),
        "standard_language": (
            "Vendor warrants that the Services will perform materially in accordance "
            "with the Documentation. If the Services fail to conform, Vendor shall "
            "correct the non-conformity; if it cannot do so within thirty (30) days, "
            "Customer may terminate and receive a pro-rata refund of prepaid fees."
        ),
        "guidance": (
            "Watch for 'sole and exclusive remedy' language, which converts a warranty "
            "into a cap by another route."
        ),
        "basis": (
            "Box s.7 makes termination the 'sole and exclusive remedy'; Superhuman "
            "s.8.3 warrants for the subscription term."
        ),
        "severity": "NEGOTIABLE",
        "is_required": False,
        "detection_hints": (
            "warrants that the services; sole and exclusive remedy; materially in "
            "accordance with the documentation; disclaimer"
        ),
    },
    {
        "clause_type": "SLA_CREDITS",
        "title": "Service levels and credits",
        "preferred_position": (
            "99.9% monthly uptime with escalating credits, and a termination right for "
            "persistent failure across three consecutive months."
        ),
        "fallback_position": (
            "99.5% uptime with credits, and termination for chronic failure."
        ),
        "walkaway_position": (
            "No SLA, or credits as the sole and exclusive remedy with no termination "
            "right."
        ),
        "standard_language": (
            "Vendor shall maintain at least 99.9% Availability per calendar month. "
            "Where Availability falls below the committed level in three consecutive "
            "months, Customer may terminate without penalty and receive a pro-rata "
            "refund."
        ),
        "guidance": (
            "Scrutinise the excused-downtime list as closely as the percentage. Vimeo "
            "excuses outages caused by the unavailability of AWS or Google Cloud, "
            "which covers a large share of realistic failure modes."
        ),
        "basis": (
            "Vimeo Exhibit A defines Excused Downtime to include unavailability of "
            "Amazon or Google cloud services. Box s.6 ties service levels to a "
            "separate document."
        ),
        "severity": "NEGOTIABLE",
        "is_required": False,
        "detection_hints": (
            "service level agreement; uptime; availability; service credits; excused "
            "downtime; scheduled maintenance"
        ),
    },
    {
        "clause_type": "PUBLICITY",
        "title": "Use of name and logo",
        "preferred_position": (
            "No use of the customer's name, logo or marks without prior written "
            "consent for each use."
        ),
        "fallback_position": (
            "Listing on a customer page permitted; press releases and case studies "
            "require consent."
        ),
        "walkaway_position": (
            "Unrestricted right to use the customer's name and marks in marketing."
        ),
        "standard_language": (
            "Vendor shall not use Customer's name, logo or trademarks in any "
            "advertising, press release or customer list without Customer's prior "
            "written consent in each instance."
        ),
        "guidance": (
            "Usually conceded without argument, and worth taking because it is one of "
            "the few clauses with reputational rather than financial exposure."
        ),
        "basis": (
            "Superhuman s.5.6 grants itself the right to use Customer's name, logo and "
            "marks by default."
        ),
        "severity": "NEGOTIABLE",
        "is_required": False,
        "detection_hints": (
            "customer reference; name logo and marks; press release; publicity; "
            "customer list"
        ),
    },
    {
        "clause_type": "ASSIGNMENT_CHANGE_CONTROL",
        "title": "Assignment and change of control",
        "preferred_position": (
            "Customer may assign freely to affiliates and in connection with a merger "
            "or reorganisation; the vendor may not assign without consent."
        ),
        "fallback_position": (
            "Mutual right to assign on a change of control, with notice."
        ),
        "walkaway_position": (
            "Customer barred from assigning while the vendor may assign freely, "
            "including to a competitor of the customer."
        ),
        "standard_language": (
            "Customer may assign this Agreement to an Affiliate or in connection with "
            "a merger, acquisition or reorganisation without Vendor's consent. Vendor "
            "may not assign without Customer's prior written consent, such consent not "
            "to be unreasonably withheld."
        ),
        "guidance": (
            "Matters more for an acquisitive group. Superhuman's clause restricts the "
            "customer only, which is the common asymmetry."
        ),
        "basis": (
            "Superhuman s.12.3 - 'Customer may not assign this Agreement... in whole "
            "or in part' with no reciprocal restriction on Superhuman."
        ),
        "severity": "NEGOTIABLE",
        "is_required": False,
        "detection_hints": (
            "may not assign; assignment; change of control; merger or acquisition; "
            "successors and assigns"
        ),
    },
]


def clause_type_catalogue() -> list[str]:
    return [r["clause_type"] for r in SEED_RULES]
