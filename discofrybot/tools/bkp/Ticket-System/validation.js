// validation.js
const { TextInputBuilder, TextInputStyle } = require('discord.js');
const validator = require('validator');
const { ERROR_MESSAGES } = require('./validationErrorManager');

const PREFIXES = [
    'BM','ISM','OSM','IDM','ODM','HWM','LWM',
    'IHAQM','ILAQM','OHAQM','IRM','OHWQM','OLWQM',
    'EM','AOWSCM','AIWSCM','AOWCM','AIWCM',
    'AOSCM','AISCM','AOTCM','AITCM','RDN','SVN','SDN'
  ];

const minerKeyRegex = new RegExp(`^(?:${PREFIXES.join('|')})-[A-Z0-9]{31,33}$`);

const VALIDATION_PATTERNS = {
    EMAIL: /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/,
    ORDER_NUMBER: /^\d{5}$/,
    ALGORAND_ADDRESS: /^[A-Z2-7]{58}$/,
    MINER_KEYS: minerKeyRegex,
};

const baseFields = {
    contact_info: new TextInputBuilder()
        .setCustomId('contact_info')
        .setLabel('Contact Information (Full Name+Email)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g., John Smith johnsmith@email.com'),
    order_number: new TextInputBuilder()
        .setCustomId('order_number')
        .setLabel('Order Number')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('Enter your 5-digit order number'),
    minerkeys: new TextInputBuilder()
        .setCustomId('minerkeys')
        .setLabel('Miner Keys')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g., IRM-A1BJD26E2FSO2F337SQ3BEF4DRAAWPE3'),
    algorand_address: new TextInputBuilder()
        .setCustomId('algorand_address')
        .setLabel('Algorand Address')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g., RL6VDLXCN5G7N2GRTS7YLVDSFT4PVBBUOVTVS7T26OQ5MLXYQKRMI5ADXY'),
    description: new TextInputBuilder()
        .setCustomId('description')
        .setLabel('Describe Your Issue')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setPlaceholder('Provide a brief description of your issue')
};

const ticketFields = {
    order_tracking: ['contact_info', 'order_number', 'description'],
    registration: ['contact_info', 'minerkeys', 'order_number', 'algorand_address', 'description'],
    miner_keys: ['contact_info', 'order_number', 'algorand_address', 'description'],
    rewards: ['contact_info', 'minerkeys', 'order_number', 'algorand_address', 'description'],
    tech_support: ['contact_info', 'minerkeys', 'order_number', 'algorand_address', 'description']
};

// Sanitization + Validation Functions
function sanitizeAndValidateContactInfo(value) {
    const trimmedValue = validator.trim(value);
    const contactRegex = /^(.+?)\s+([\w.-]+@[\w.-]+\.\w+)$/;
    const match = trimmedValue.match(contactRegex);
    if (!match) return { error: ERROR_MESSAGES.CONTACT_INFO };
    const fullName = validator.escape(match[1].trim());
    const email = validator.normalizeEmail(match[2].trim());
    if (!VALIDATION_PATTERNS.EMAIL.test(email)) return { error: ERROR_MESSAGES.EMAIL };
    return { value: { fullName, email } };
}

function sanitizeAndValidateOrderNumber(value) {
    const sanitizedValue = validator.trim(value);
    if (!VALIDATION_PATTERNS.ORDER_NUMBER.test(sanitizedValue)) return { error: ERROR_MESSAGES.ORDER_NUMBER };
    return { value: sanitizedValue };
}

function sanitizeAndValidateAlgorandAddress(value) {
    const sanitizedValue = validator.trim(value);
    if (!VALIDATION_PATTERNS.ALGORAND_ADDRESS.test(sanitizedValue)) return { error: ERROR_MESSAGES.ALGORAND_ADDRESS };
    return { value: sanitizedValue };
}

function sanitizeAndValidateMinerKeys(value) {
    const sanitizedValue = validator.trim(value);
    if (!VALIDATION_PATTERNS.MINER_KEYS.test(sanitizedValue)) return { error: ERROR_MESSAGES.MINER_KEYS };
    return { value: sanitizedValue };
}

function sanitizeAndValidateDescription(value) {
    const sanitizedValue = validator.escape(validator.trim(value));
    if (!sanitizedValue) return { error: 'Description cannot be empty.' };
    return { value: sanitizedValue };
}

function validateTicketSubmission(ticketType, fields) {
    const requiredFields = ticketFields[ticketType];
    const errors = [];  
    const validatedData = {};

    requiredFields.forEach(fieldKey => {
        const value = fields[fieldKey] || '';
        let result;

        switch (fieldKey) {
            case 'contact_info':
                result = sanitizeAndValidateContactInfo(value);
                if (result.error) errors.push(result.error);
                else {
                    validatedData.fullName = result.value.fullName;
                    validatedData.email = result.value.email;
                }
                break;
            case 'order_number':
                result = sanitizeAndValidateOrderNumber(value);
                if (result.error) errors.push(result.error);
                else validatedData.orderNumber = result.value;
                break;
            case 'algorand_address':
                result = sanitizeAndValidateAlgorandAddress(value);
                if (result.error) errors.push(result.error);
                else validatedData.algorandAddress = result.value;
                break;
            case 'minerkeys':
                result = sanitizeAndValidateMinerKeys(value);
                if (result.error) errors.push(result.error);
                else validatedData.minerKeys = result.value;
                break;
            case 'description':
                result = sanitizeAndValidateDescription(value);
                if (result.error) errors.push(result.error);
                else validatedData.description = result.value;
                break;
        }
    });

    return { errors, validatedData };
}

module.exports = {
    baseFields,
    ticketFields,
    validateTicketSubmission
};
