const { ERRORS, KEYWORDS, PRECEDENCE, TYPES, TOKENS } = require("../../constants");

// recursive descent parser
const parse = input => {
    const procIs = (type, inbound) => {
        const token = input.peek();
        // console.log({token}, {type}, {inbound});
        return token && token.type === type && (!inbound || token.value === inbound) && token;
    };
    
    const isPunctuator = inbound => procIs(TYPES.PUNCTUATOR, inbound);

    const isKeyword = inbound => procIs(TYPES.KEYWORD, inbound);

    const isOperator = inbound => procIs(TYPES.OPERATOR, inbound);

    const passPunctuator = inbound => isPunctuator(inbound) ? input.next() : input.term(ERRORS.NO_PUNCTUATOR, inbound);

    const passKeyword = inbound => isKeyword(inbound) ? input.next() : input.term(ERRORS.NO_KEYWORD, inbound);

    const passOperator = inbound => isOperator(inbound) ? input.next() : input.term(ERRORS.NO_OPERATOR, inbound);

    const unexpected = () => input.term(ERRORS.TOKEN_ERR, JSON.stringify(input.peek()));

    return parseRoot();

    function isNextBinary(left, precedence) {
        const token = isOperator();
        if (token) {
            const metric = PRECEDENCE[token.value];
            if (metric > precedence) {
                input.next();
                return isNextBinary({
                    type: token.value === TOKENS.ASSIGNMENT ? TYPES.ASSIGNMENT : TYPES.BINARY,
                    operator: token.value,
                    left,
                    right: isNextBinary(parseAtom(), metric)
                }, precedence);
            }
        }
        return left;
    };

    function delimited(begin, end, imperative, parser) {
        const collatedArgs = [];
        let initialChar = true;
        passPunctuator(begin);
        while (!input.eof()) {
            if (isPunctuator(end)) {
                break;
            }
            if (initialChar) {
                initialChar = false; 
            }
            else {
                passPunctuator(imperative);
            }
            if (isPunctuator(end)) {
                break;
            }
            collatedArgs.push(parser());
        }
        passPunctuator(end);
        return collatedArgs;
    };

    // func call, parse expression therein
    function parseCall(func) {
        return {
            type: TYPES.CALL,
            func,
            args: delimited(TOKENS.EXPR_OPEN, TOKENS.EXPR_CLOSE, TOKENS.DELIMITER, parseExpression),
        };
    };

    function parseVariable() {
        const token = input.next();
        if (token.type !== TYPES.VARIABLE) {
            input.term(ERRORS.NO_VARNAME);
        }
        return token.value;
    };

    function parseIfStatement() {
        passKeyword(KEYWORDS.CONDITIONAL);
        const condition = parseExpression();
        if (!isPunctuator(TOKENS.BLOCK_OPEN)) {
            passKeyword(KEYWORDS.PROC);
        }
        const then = parseExpression();

        const conditionalExpression = {
            type: KEYWORDS.CONDITIONAL,
            condition,
            do: then,
        };
        if (isKeyword(KEYWORDS.ALTERNATIVE)) {
            input.next();
            conditionalExpression.else = parseExpression();
        }
        return conditionalExpression;
    };

    function parseResolver() {
        return {
            type: KEYWORDS.FUNCTION,
            name: input.peek().type === TYPES.VARIABLE ? input.next().value : null,
            vars: delimited(TOKENS.EXPR_OPEN, TOKENS.EXPR_CLOSE, TOKENS.DELIMITER, parseVariable),
            body: parseExpression()
        };
    };
    
    function parseBoolean() {
        return {
            type: TYPES.BOOLEAN,
            value: input.next().value === KEYWORDS.TRUE
        };
    };
    
    // receives a function expected to parse current expression
    function isNextCall(inbound) {
        // parse expression and thereafter, check for expression / call open
        inbound = inbound();
        return isPunctuator(TOKENS.EXPR_OPEN) ? parseCall(inbound) : inbound;
    };

    // root dispatcher
    function parseAtom() {
        // checks for expression open
        return isNextCall(() => {
            // expects expression open
            if (isPunctuator(TOKENS.EXPR_OPEN)) {
                // expression open, skip token and expect expression
                input.next();
                const expression = parseExpression();
                // expect expression close 
                passPunctuator(TOKENS.EXPR_CLOSE);
                return expression;
            }
            if (isPunctuator(TOKENS.BLOCK_OPEN)) {
                return parseSequence();
            }
            if (isOperator("!")) {
                input.next();
                return {
                    type: TYPES.NEGATION,
                    body: parseExpression()
                };
            }
            if (isKeyword(KEYWORDS.DECLARATION)) {
                return parseLet();
            }
            if (isKeyword(KEYWORDS.CONDITIONAL)) {
                return parseIfStatement();
            }
            if (isKeyword(KEYWORDS.TRUE) || isKeyword(KEYWORDS.FALSE)) {
                return parseBoolean();
            }
            if (isKeyword(KEYWORDS.FUNCTION) || isKeyword("ε")) {
                input.next();
                return parseResolver();
            }
            const token = input.next();
            if (token.type === TYPES.VARIABLE || token.type === TYPES.INTEGER || token.type === TYPES.STRING) {
                return token;
            }
            // no possible cases, throw
            unexpected();
        });
    };

    function parseRoot() {
        const seq = [];
        while (!input.eof()) {
            seq.push(parseExpression());
            if (!input.eof()) {
                passPunctuator(TOKENS.END_EXPR);
            }
        }
        return { type: TYPES.SEQUENCE, seq };
    };
    
    function parseSequence() {
        const seq = delimited(TOKENS.BLOCK_OPEN, TOKENS.BLOCK_CLOSE, TOKENS.END_EXPR, parseExpression);
        // sequence is empty, return false node
        if (seq.length === 0) {
            return { type: TYPES.BOOLEAN, value: false };
        }
        if (seq.length === 1) { 
            return seq[0];
        }
        return { type: TYPES.SEQUENCE, seq };
    };

    function parseExpression() {
        return isNextCall(() => isNextBinary(parseAtom(), 0));
    };
            
    function parseLet() {
        passKeyword(KEYWORDS.DECLARATION);
        if (input.peek().type == TYPES.VARIABLE) {
            const name = input.next().value;
            const defs = delimited(TOKENS.EXPR_OPEN, TOKENS.EXPR_CLOSE, TOKENS.DELIMITER, parseNamedLet);
            
            return {
                type: TYPES.CALL,
                func: {
                    type: KEYWORDS.FUNCTION,
                    name,
                    vars: defs.map(def => def.name),
                    body: parseExpression(),
                },
                args: defs.map(def => def.def || { type: TYPES.BOOLEAN, value: false } )
            };
        }
        return {
            type: KEYWORDS.DECLARATION,
            vars: delimited(TOKENS.EXPR_OPEN, TOKENS.EXPR_CLOSE, TOKENS.DELIMITER, parseNamedLet),
            body: parseExpression(),
        };
    };

    function parseNamedLet() {
        var name = parseVariable(), 
            def;
        if (isOperator(TOKENS.ASSIGNMENT)) {
            input.next();
            def = parseExpression();
        }
        return { name, def };
    };

};

module.exports = parse;
