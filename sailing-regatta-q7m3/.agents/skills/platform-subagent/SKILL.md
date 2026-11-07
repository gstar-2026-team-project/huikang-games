---
name: platform-subagent
description: Build a single-device prototype while a second agent integrates it with the Joiner platform in the background. Use when the creator explicitly types /platform-subagent. Follows the normal prototype workflow; asking to integrate hands the staged tile over through begin_conversion.
allowed-tools: Bash, Glob, Grep, Read, Edit, Write
user-invocable: true
---

# Prototype with a background integration agent

The creator chose the prototype workflow with a background integration agent. Follow [prototype](../prototype/SKILL.md) as inlined, reading it first if it is not already in context. Nothing about how you build or edit the prototype changes.

A second agent stages the integrated tile under `/workspace/.staging`. Never read, edit or mention that directory's contents; it is not yours until `begin_conversion` hands it to you.

When the creator asks to integrate with Joiner, call `begin_conversion` as the prototype skill says. Its result tells you what was staged; read the notes it names before anything else, and continue from there. When the result says the candidate is ready, do what the result says and promote it without re-reading references. Do not scaffold over a candidate that exists; scaffold only if the result says the candidate is unusable or you find it so.

If no platform notice about a background agent appears after your first preview, this is an ordinary prototype session, and nothing here applies.
